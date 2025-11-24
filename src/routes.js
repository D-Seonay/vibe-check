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

  // /connect
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

  // /callback
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

  // /api/now-playing
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

  // /api/top-tracks
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

  // NEW: /api/recent-tracks
  router.get('/api/recent-tracks', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      const limit = Math.max(1, Math.min(10, Number(req.query.limit || 10)));
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

  // NEW: /api/top-artists
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

  // NEW: /api/current-status
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

  // NEW: /api/profile
  router.get('/api/profile', async (req, res) => {
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

      const profile = await getMe(accessToken);

      const svg = renderProfileSVG(profile);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(svg);
    } catch (err) {
      console.error(err);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(renderProfileSVG(null));
    }
  });

  return router;
}
