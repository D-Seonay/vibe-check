// src/routes.js
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
} from './svg.js';
import { createRateLimiter } from './rateLimit.js';
import {
  refreshAccessToken,
  getCurrentlyPlaying,
  getTopTracks,
  getRecentlyPlayed,
  getTopArtists,
  getMe,
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
   * /connect:
   *   get:
   *     summary: Connect to Spotify
   *     description: Redirects to Spotify to authorize the application.
   *     responses:
   *       302:
   *         description: Redirects to Spotify authorization page.
   */
  router.get('/connect', (req, res) => {
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
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Connecter Spotify</title></head>
<body style="font-family: system-ui; padding: 24px;">
  <h1>Connecter ton Spotify</h1>
  <p>Tu vas être redirigé vers Spotify pour autoriser l’accès aux informations de lecture, tops, dernières écoutes et profil.</p>
  <a href="${authUrl}" style="display:inline-block;padding:12px 16px;background:#1DB954;color:#fff;text-decoration:none;border-radius:6px;">Autoriser avec Spotify</a>
</body>
</html>`;
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

      const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Token généré</title></head>
<body style="font-family: system-ui; padding: 24px;">
  <h1>Token généré ✅</h1>
  <p>Copie les lignes Markdown ci-dessous dans ton README.md:</p>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${mdNow}</pre>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${mdTopTracks}</pre>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${mdRecent}</pre>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${mdTopArtists}</pre>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${mdStatus}</pre>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${mdProfile}</pre>
  <p><strong>Important:</strong> Ce JWT expire dans ${JWT_EXPIRES_IN}. Tu pourras revenir sur <a href="/connect">/connect</a> pour régénérer un token.</p>
</body>
</html>`;
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

      const svg = renderNowPlayingSVG(nowPlaying);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderNowPlayingSVG(null));
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

      const svg = renderTopTracksSVG(top?.items || []);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderTopTracksSVG([]));
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

      const svg = renderRecentTracksSVG(items);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderRecentTracksSVG([]));
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

      const svg = renderTopArtistsSVG(items);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderTopArtistsSVG([]));
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

      const svg = renderCurrentStatusSVG(nowPlaying);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderCurrentStatusSVG(null));
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
      const {
        jwt,
        bg_color = '121212',
        text_color = 'FFFFFF',
        subtext_color = 'B3B3B3',
        title_color = 'FFFFFF',
        show_id = 'false',
        show_followers = 'true',
        show_top_artist = 'true',
        show_top_tracks = 'true', // Ajout du paramètre pour les top tracks
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
        const topArtistsData = await getTopArtists(accessToken, { timeRange: 'short_term', limit: 3 });
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
      
      const options = {
        bg_color: `#${bg_color}`,
        text_color: `#${text_color}`,
        subtext_color: `#${subtext_color}`,
        title_color: `#${title_color}`,
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

  return router;
}
