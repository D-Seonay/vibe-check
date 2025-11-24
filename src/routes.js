// src/routes.js
import express from 'express';
import crypto from 'crypto';
import querystring from 'querystring';
import { signJWT, verifyJWT } from './jwt.js';
import { renderNowPlayingSVG, renderTopTracksSVG } from './svg.js';
import { createRateLimiter } from './rateLimit.js';
import { refreshAccessToken, getCurrentlyPlaying, getTopTracks } from './spotify.js';

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
  <p>Tu vas être redirigé vers Spotify pour autoriser l’accès à la lecture et aux tops. Après validation, tu obtiendras un token sécurisé (JWT) à utiliser dans ton README.</p>
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
      const tokenRes = await fetchToken(data, basic);

      const refreshToken = tokenRes.refresh_token;
      if (!refreshToken) {
        return res.status(400).send('Refresh token introuvable (vérifie les scopes et consentement)');
      }

      const jwt = signJWT({ rt: refreshToken }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      const host = hostForMarkdown || req.headers.host;
      const markdownNP = `![Spotify Now Playing](https://${host}/api/now-playing?jwt=${encodeURIComponent(jwt)})`;
      const markdownTT = `![Spotify Top Tracks](https://${host}/api/top-tracks?jwt=${encodeURIComponent(jwt)}&limit=10)`;

      const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Token généré</title></head>
<body style="font-family: system-ui; padding: 24px;">
  <h1>Token généré ✅</h1>
  <p>Copie une des lignes Markdown ci-dessous dans ton README.md:</p>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${markdownNP}</pre>
  <pre style="background:#f5f5f5;padding:12px;border-radius:6px;">${markdownTT}</pre>
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

  async function fetchToken(data, basic) {
    // Utilise post() défini dans spotify.js via refreshAccessToken? Non: ici on a besoin d'authorization_code
    const res = await import('./http.js').then(({ post }) =>
      post('https://accounts.spotify.com/api/token', data, {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      })
    );
    return res;
  }

  // /api/now-playing
  router.get('/api/now-playing', async (req, res) => {
    try {
      const jwt = req.query.jwt;
      if (!jwt || typeof jwt !== 'string') {
        return res.status(400).send('Paramètre manquant: jwt');
      }

      if (!rateLimit(jwt)) {
        return res.status(429).send('Trop de requêtes');
      }

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload || !payload.rt) {
        return res.status(401).send('JWT invalide ou expiré');
      }

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
      if (!jwt || typeof jwt !== 'string') {
        return res.status(400).send('Paramètre manquant: jwt');
      }
      if (!rateLimit(jwt)) {
        return res.status(429).send('Trop de requêtes');
      }

      const payload = verifyJWT(jwt, JWT_SECRET);
      if (!payload || !payload.rt) {
        return res.status(401).send('JWT invalide ou expiré');
      }

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

  return router;
}
