import express from 'express';
import crypto from 'crypto';
import querystring from 'querystring';
import { signJWT, verifyJWT } from './jwt.js';
import {
  renderNowPlayingSVG,
  renderTopTracksSVG,
  renderRecentTracksSVG,
  renderTopArtistsSVG,
  renderCurrentStatusSVG,
  renderProfileSVG,
  renderCallbackPreviewHTML,
  renderConnectPage,
  renderListeningMosaicSVG,
  getTheme,
} from './svg.js';
import { createRateLimiter } from './rateLimit.js';
import {
  refreshAccessToken,
  getCurrentlyPlaying,
  getTopTracks,
  getRecentlyPlayed,
  getTopArtists,
  getMe,
  getListeningHistory,
} from './spotify.js';

export function createRouter(config) {
  const {
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    JWT_SECRET,
    JWT_EXPIRES_IN = '30d',
    RATE_LIMIT_WINDOW_MS = 60_000,
    RATE_LIMIT_MAX = 60,
    hostForMarkdown,
  } = config;

  const router = express.Router();
  const rateLimit = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);

  /**
   * @swagger
   * /:
   *   get:
   *     summary: Connect to Spotify
   *     description: Redirects to Spotify to authorize the application.
   *     responses:
   *       302:
   *         description: Redirects to Spotify authorization page.
   */
  router.get('/', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = [
      'user-read-currently-playing',
      'user-read-playback-state',
      'user-top-read',
      'user-read-recently-played',
      'user-read-email',
      'user-read-private',
    ].join(' ');

    const params = querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope,
      redirect_uri: REDIRECT_URI,
      state,
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params}`;
    const html = renderConnectPage({ authUrl });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  /**
   * @swagger
   * /callback:
   *   get:
   *     summary: Spotify callback
   *     description: Handles the callback from Spotify after authorization.
   *     parameters:
   *       - in: query
   *         name: code
   *         schema:
   *           type: string
   *         required: true
   *         description: The authorization code from Spotify.
   *     responses:
   *       200:
   *         description: Shows the generated JWT and markdown snippets.
   *       400:
   *         description: Missing or invalid authorization code.
   */
  router.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code || typeof code !== 'string') {
      return res.status(400).send('Code OAuth manquant');
    }

    try {
      const data = querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      });

      const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const tokenRes = await import('./http.js').then(({ post }) =>
        post('https://accounts.spotify.com/api/token', data, {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
        })
      );

      const refreshToken = tokenRes.refresh_token;
      if (!refreshToken) {
        return res.status(400).send('Refresh token introuvable (vérifie les scopes et consentement)');
      }

      const jwt = signJWT({ rt: refreshToken }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      const host = hostForMarkdown || req.headers.host;
      const mdNow = `![Spotify Now Playing](https://${host}/api/now-playing?jwt=${encodeURIComponent(jwt)})`;
      const mdTopTracks = `![Spotify Top Tracks](https://${host}/api/top-tracks?jwt=${encodeURIComponent(jwt)}&limit=10)`;
      const mdRecent = `![Spotify Recently Played](https://${host}/api/recent-tracks?jwt=${encodeURIComponent(jwt)}&limit=10)`;
      const mdTopArtists = `![Spotify Top Artists](https://${host}/api/top-artists?jwt=${encodeURIComponent(jwt)}&limit=10&time_range=short_term)`;
      const mdStatus = `![Spotify Status](https://${host}/api/current-status?jwt=${encodeURIComponent(jwt)})`;
      const mdProfile = `![Spotify Profile](https://${host}/api/profile?jwt=${encodeURIComponent(jwt)})`;
      const mdMosaic = `![Spotify Listening Mosaic](https://${host}/api/listening-mosaic?jwt=${encodeURIComponent(jwt)})`;

      // --- New logic for preview ---
      const payload = verifyJWT(jwt, JWT_SECRET); // Verify the JWT just generated to get payload.rt for subsequent calls

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      // Fetch data for all widgets
      const nowPlayingData = await getCurrentlyPlaying(accessToken);
      const topTracksData = await getTopTracks(accessToken, { timeRange: 'short_term', limit: 10 });
      const recentTracksData = await getRecentlyPlayed(accessToken, { limit: 10 });
      const topArtistsData = await getTopArtists(accessToken, { timeRange: 'short_term', limit: 10 });
      const profileData = await getMe(accessToken);

      let profileImageAsB64 = null;
      if(profileData?.images?.length > 0) {
        const imageUrl = profileData.images[0].url;
        const imageBuffer = await import('./http.js').then(({ getBuffer }) => getBuffer(imageUrl));
        profileImageAsB64 = imageBuffer.toString('base64');
      }

      let profileTopArtists = [];
      if (topArtistsData?.items) {
        profileTopArtists = await Promise.all(topArtistsData.items.slice(0,3).map(async (artist) => { // Only 3 for profile card
          let imageB64 = null;
          if (artist.images.length > 0) {
            const imageUrl = artist.images[0].url;
            const imageBuffer = await import('./http.js').then(({ getBuffer }) => getBuffer(imageUrl));
            imageB64 = imageBuffer.toString('base64');
          }
          return { ...artist, imageB64 };
        }));
      }

      let profileTopTracks = [];
      if (topTracksData?.items) {
        profileTopTracks = await Promise.all(topTracksData.items.slice(0,5).map(async (track) => { // Only 5 for profile card
          let imageB64 = null;
          if (track.album.images.length > 0) {
            const imageUrl = track.album.images[0].url;
            const imageBuffer = await import('./http.js').then(({ getBuffer }) => getBuffer(imageUrl));
            imageB64 = imageBuffer.toString('base64');
          }
          return { ...track, imageB64 };
        }));
      }

      // Generate SVGs
      const nowPlayingSvg = renderNowPlayingSVG(nowPlayingData);
      const topTracksSvg = renderTopTracksSVG(topTracksData?.items || []);
      const recentTracksSvg = renderRecentTracksSVG(recentTracksData?.items || []);
      const topArtistsSvg = renderTopArtistsSVG(topArtistsData?.items || []);
      const currentStatusSvg = renderCurrentStatusSVG(nowPlayingData);
      const profileSvg = renderProfileSVG(profileData, profileImageAsB64, profileTopArtists, profileTopTracks, {}); // Default options for preview
      const listeningHistory = await getListeningHistory(accessToken);
      const listeningMosaicSvg = renderListeningMosaicSVG(listeningHistory);

      // Render the new preview HTML
      const html = renderCallbackPreviewHTML({
        jwt,
        mdNow,
        mdTopTracks,
        mdRecent,
        mdTopArtists,
        mdStatus,
        mdProfile,
        mdMosaic,
        nowPlayingSvg,
        topTracksSvg,
        recentTracksSvg,
        topArtistsSvg,
        currentStatusSvg,
        profileSvg,
        listeningMosaicSvg,
        jwtExpiresIn: JWT_EXPIRES_IN,
        host, // Pass the host to the template
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(html);

    } catch (err) {
      console.error(err);
      res.status(500).send('Erreur lors de l’échange OAuth');
    }
  });

  /**
   * @swagger
   * /api/now-playing:
   *   get:
   *     summary: Get currently playing song as an SVG.
   *     parameters:
   *       - in: query
   *         name: jwt
   *         schema:
   *           type: string
   *         required: true
   *         description: The JWT token.
   *     responses:
   *       200:
   *         description: An SVG image of the currently playing song.
   *         content:
   *           image/svg+xml:
   *             schema:
   *               type: string
   *               format: binary
   */
  router.get('/api/now-playing', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      const theme = req.query.theme;
      if (!jwt || typeof jwt !== 'string') return res.status(400).send('Paramètre manquant: jwt');
      if (!rateLimit(jwt)) return res.status(429).send('Trop de requêtes');

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload?.rt) return res.status(401).send('JWT invalide ou expiré');

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      const nowPlaying = await getCurrentlyPlaying(accessToken);

      const svg = renderNowPlayingSVG(nowPlaying, theme);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderNowPlayingSVG(null, req.query.theme));
    }
  });

  /**
   * @swagger
   * /api/top-tracks:
   *   get:
   *     summary: Get top tracks as an SVG.
   *     parameters:
   *       - in: query
   *         name: jwt
   *         schema:
   *           type: string
   *         required: true
   *         description: The JWT token.
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 10
   *         default: 5
   *         description: The number of tracks to display.
   *     responses:
   *       200:
   *         description: An SVG image of the top tracks.
   *         content:
   *           image/svg+xml:
   *             schema:
   *               type: string
   *               format: binary
   */
  router.get('/api/top-tracks', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      const theme = req.query.theme;
      const limit = Math.max(1, Math.min(10, Number(req.query.limit || 5)));
      if (!jwt || typeof jwt !== 'string') return res.status(400).send('Paramètre manquant: jwt');
      if (!rateLimit(jwt)) return res.status(429).send('Trop de requêtes');

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload?.rt) return res.status(401).send('JWT invalide ou expiré');

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      const top = await getTopTracks(accessToken, { timeRange: 'short_term', limit });

      const svg = renderTopTracksSVG(top?.items || [], theme);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderTopTracksSVG([], req.query.theme));
    }
  });

  /**
   * @swagger
   * /api/recent-tracks:
   *   get:
   *     summary: Get recently played tracks as an SVG.
   *     parameters:
   *       - in: query
   *         name: jwt
   *         schema:
   *           type: string
   *         required: true
   *         description: The JWT token.
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 50
   *         default: 10
   *         description: The number of tracks to display.
   *     responses:
   *       200:
   *         description: An SVG image of recently played tracks.
   *         content:
   *           image/svg+xml:
   *             schema:
   *               type: string
   *               format: binary
   */
  router.get('/api/recent-tracks', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      const theme = req.query.theme;
      const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
      if (!jwt || typeof jwt !== 'string') return res.status(400).send('Paramètre manquant: jwt');
      if (!rateLimit(jwt)) return res.status(429).send('Trop de requêtes');

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload?.rt) return res.status(401).send('JWT invalide ou expiré');

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      const recent = await getRecentlyPlayed(accessToken, { limit });
      const items = Array.isArray(recent?.items) ? recent.items : [];

      const svg = renderRecentTracksSVG(items, theme);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderRecentTracksSVG([], req.query.theme));
    }
  });

  /**
   * @swagger
   * /api/top-artists:
   *   get:
   *     summary: Get top artists as an SVG.
   *     parameters:
   *       - in: query
   *         name: jwt
   *         schema:
   *           type: string
   *         required: true
   *         description: The JWT token.
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 10
   *         default: 5
   *         description: The number of artists to display.
   *       - in: query
   *         name: time_range
   *         schema:
   *           type: string
   *           enum: [short_term, medium_term, long_term]
   *         default: short_term
   *         description: The time range for the top artists.
   *     responses:
   *       200:
   *         description: An SVG image of top artists.
   *         content:
   *           image/svg+xml:
   *             schema:
   *               type: string
   *               format: binary
   */
  router.get('/api/top-artists', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      const theme = req.query.theme;
      const limit = Math.max(1, Math.min(10, Number(req.query.limit || 5)));
      const timeRangeRaw = String(req.query.time_range || 'short_term');
      const timeRange = ['short_term', 'medium_term', 'long_term'].includes(timeRangeRaw)
        ? timeRangeRaw
        : 'short_term';

      if (!jwt || typeof jwt !== 'string') return res.status(400).send('Paramètre manquant: jwt');
      if (!rateLimit(jwt)) return res.status(429).send('Trop de requêtes');

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload?.rt) return res.status(401).send('JWT invalide ou expiré');

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      const artists = await getTopArtists(accessToken, { timeRange, limit });
      const items = Array.isArray(artists?.items) ? artists.items : [];

      const svg = renderTopArtistsSVG(items, theme);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderTopArtistsSVG([], req.query.theme));
    }
  });

  /**
   * @swagger
   * /api/current-status:
   *   get:
   *     summary: Get current Spotify status as an SVG.
   *     parameters:
   *       - in: query
   *         name: jwt
   *         schema:
   *           type: string
   *         required: true
   *         description: The JWT token.
   *     responses:
   *       200:
   *         description: An SVG image of the current Spotify status.
   *         content:
   *           image/svg+xml:
   *             schema:
   *               type: string
   *               format: binary
   */
  router.get('/api/current-status', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      const theme = req.query.theme;
      if (!jwt || typeof jwt !== 'string') return res.status(400).send('Paramètre manquant: jwt');
      if (!rateLimit(jwt)) return res.status(429).send('Trop de requêtes');

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload?.rt) return res.status(401).send('JWT invalide ou expiré');

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      const nowPlaying = await getCurrentlyPlaying(accessToken);

      const svg = renderCurrentStatusSVG(nowPlaying, theme);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderCurrentStatusSVG(null, req.query.theme));
    }
  });

  /**
   * @swagger
   * /api/profile:
   *   get:
   *     summary: Get user profile as an SVG.
   *     parameters:
   *       - in: query
   *         name: jwt
   *         schema:
   *           type: string
   *         required: true
   *         description: The JWT token.
   *       - in: query
   *         name: bg_color
   *         schema:
   *           type: string
   *         default: "121212"
   *         description: Background color (hex without #).
   *       - in: query
   *         name: text_color
   *         schema:
   *           type: string
   *         default: "FFFFFF"
   *         description: Text color (hex without #).
   *       - in: query
   *         name: subtext_color
   *         schema:
   *           type: string
   *         default: "B3B3B3"
   *         description: Subtext color (hex without #).
   *       - in: query
   *         name: title_color
   *         schema:
   *           type: string
   *         default: "FFFFFF"
   *         description: Title color (hex without #).
   *       - in: query
   *         name: show_id
   *         schema:
   *           type: boolean
   *         default: false
   *         description: Show Spotify user ID.
   *       - in: query
   *         name: show_followers
   *         schema:
   *           type: boolean
   *         default: true
   *         description: Show follower count.
   *       - in: query
   *         name: show_top_artist
   *         schema:
   *           type: boolean
   *         default: true
   *         description: Show top artist.
   *       - in: query
   *         name: top_artists_limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 10
   *         default: 3
   *         description: The number of top artists to display (if show_top_artist is true).
   *       - in: query
   *         name: gradient_bg
   *         schema:
   *           type: boolean
   *         default: false
   *         description: Use a gradient background.
   *       - in: query
   *         name: gradient_start_color
   *         schema:
   *           type: string
   *         default: "444444"
   *         description: Gradient start color (hex without #).
   *       - in: query
   *         name: gradient_end_color
   *         schema:
   *           type: string
   *         default: "121212"
   *         description: Gradient end color (hex without #).
   *       - in: query
   *         name: border_radius
   *         schema:
   *           type: integer
   *         default: 8
   *         description: Border radius of the SVG.
   *     responses:
   *       200:
   *         description: An SVG image of the user profile.
   *         content:
   *           image/svg+xml:
   *             schema:
   *               type: string
   *               format: binary
   */
  router.get('/api/profile', async (req, res) => {
    try {
      const theme = req.query.theme;
      const {
        jwt,
        bg_color,
        text_color,
        subtext_color,
        title_color,
        show_id = 'false',
        show_followers = 'true',
        show_top_artist = 'true',
        show_top_tracks = 'true',
        top_artists_limit = '3',
        gradient_bg = 'false',
        gradient_start_color = '444444',
        gradient_end_color = '121212',
        border_radius = '8',
      } = req.query;

      if (!jwt || typeof jwt !== 'string') return res.status(400).send('Paramètre manquant: jwt');
      if (!rateLimit(jwt)) return res.status(429).send('Trop de requêtes');

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload?.rt) return res.status(401).send('JWT invalide ou expiré');

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      const profile = await getMe(accessToken);
      
      let imageAsB64 = null;
      if(profile.images.length > 0) {
        const imageUrl = profile.images[0].url;
        const imageBuffer = await import('./http.js').then(({ getBuffer }) => getBuffer(imageUrl));
        imageAsB64 = imageBuffer.toString('base64');
      }

      let topArtists = [];
      if (show_top_artist === 'true') {
        const limit = Math.max(1, Math.min(10, Number(top_artists_limit)));
        const topArtistsData = await getTopArtists(accessToken, { timeRange: 'short_term', limit });
        if (topArtistsData?.items) {
          topArtists = await Promise.all(topArtistsData.items.map(async (artist) => {
            let imageB64 = null;
            if (artist.images.length > 0) {
              const imageUrl = artist.images[0].url;
              const imageBuffer = await import('./http.js').then(({ getBuffer }) => getBuffer(imageUrl));
              imageB64 = imageBuffer.toString('base64');
            }
            return { ...artist, imageB64 };
          }));
        }
      }

      let topTracks = [];
      if (show_top_tracks === 'true') {
        const topTracksData = await getTopTracks(accessToken, { timeRange: 'short_term', limit: 5 });
        if (topTracksData?.items) {
          topTracks = await Promise.all(topTracksData.items.map(async (track) => {
            let imageB64 = null;
            if (track.album.images.length > 0) {
              const imageUrl = track.album.images[0].url;
              const imageBuffer = await import('./http.js').then(({ getBuffer }) => getBuffer(imageUrl));
              imageB64 = imageBuffer.toString('base64');
            }
            return { ...track, imageB64 };
          }));
        }
      }
      
      // Determine colors based on theme, but allow overrides if query params are present
      const themeColors = getTheme(theme);
      
      // Map theme colors to profile options (strip #)
      const themeBg = themeColors.bg.replace('#', '');
      const themeFg = themeColors.fg.replace('#', '');
      const themeSub = themeColors.sub.replace('#', '');
      
      const options = {
        bg_color: `#${bg_color || themeBg}`,
        text_color: `#${text_color || themeFg}`,
        subtext_color: `#${subtext_color || themeSub}`,
        title_color: `#${title_color || themeFg}`,
        show_id: show_id === 'true',
        show_followers: show_followers === 'true',
        gradient_bg: gradient_bg === 'true',
        gradient_start_color: `#${gradient_start_color}`,
        gradient_end_color: `#${gradient_end_color}`,
        border_radius: Number(border_radius),
      };

      const svg = renderProfileSVG(profile, imageAsB64, topArtists, topTracks, options);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderProfileSVG(null, null, [], [], {}));
    }
  });

  router.get('/api/listening-mosaic', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      if (!jwt || typeof jwt !== 'string') return res.status(400).send('Paramètre manquant: jwt');
      if (!rateLimit(jwt)) return res.status(429).send('Trop de requêtes');

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload?.rt) return res.status(401).send('JWT invalide ou expiré');

      const accessToken = await refreshAccessToken({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: payload.rt,
      });

      const listeningHistory = await getListeningHistory(accessToken, { maxPages: 20 });

      const svg = renderListeningMosaicSVG(listeningHistory);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderListeningMosaicSVG([]));
    }
  });

  return router;
}