// server.js
// Serveur Express: OAuth Spotify /connect, JWT signé, SVG Now Playing et Top Tracks
// Variables d'environnement (obligatoires):
// - SPOTIFY_CLIENT_ID
// - SPOTIFY_CLIENT_SECRET
// - SPOTIFY_REDIRECT_URI (ex: https://ton-domaine.com/callback)
// - JWT_SECRET (long et aléatoire)
// Optionnel:
// - RATE_LIMIT_WINDOW_MS
// - RATE_LIMIT_MAX
// - JWT_EXPIRES_IN (ex: "30d")

import express from 'express';
import https from 'https';
import querystring from 'querystring';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Petite implémentation locale de JWT HS256 (pour éviter des dépendances). 
// Pour production, tu peux utiliser "jsonwebtoken", mais ici on reste sans deps.
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJWT(payload, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec =
    options.expiresIn
      ? typeof options.expiresIn === 'string'
        ? // "30d" ou "3600s" -> simple parse
          (() => {
            const m = options.expiresIn.match(/^(\d+)([smhd])$/);
            if (!m) return nowSec + 3600;
            const n = Number(m[1]);
            const unit = m[2];
            const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
            return nowSec + n * mult;
          })()
        : nowSec + Number(options.expiresIn)
      : nowSec + 30 * 24 * 3600; // défaut 30 jours

  const fullPayload = { ...payload, iat: nowSec, exp: expSec };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(fullPayload));
  const data = `${encHeader}.${encPayload}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sig}`;
}

function verifyJWT(token, secret) {
  try {
    const [encHeader, encPayload, encSig] = token.split('.');
    if (!encHeader || !encPayload || !encSig) return null;
    const data = `${encHeader}.${encPayload}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (expectedSig !== encSig) return null;
    const payload = JSON.parse(Buffer.from(encPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const app = express();


// Config depuis env
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !JWT_SECRET) {
  console.error('Env manquantes: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, JWT_SECRET');
  process.exit(1);
}

// Rate limit simple
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);
const hits = new Map();
function rateLimit(key) {
  const now = Date.now();
  const bucket = hits.get(key) || { count: 0, start: now };
  if (now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    bucket.count = 0;
    bucket.start = now;
  }
  bucket.count += 1;
  hits.set(key, bucket);
  return bucket.count <= RATE_LIMIT_MAX;
}

// Utils HTTP
function post(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body);
            }
          } else {
            reject(new Error(`POST ${url} ${res.statusCode} ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 204) {
            resolve(null);
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body);
            }
          } else {
            reject(new Error(`GET ${url} ${res.statusCode} ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function sanitizeText(text, maxLen = 100) {
  if (!text) return '';
  const s = String(text).replace(/[<>]/g, '');
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

async function refreshAccessToken(refreshToken) {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const data = querystring.stringify({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await post('https://accounts.spotify.com/api/token', data, {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${basic}`,
  });
  if (!res.access_token) {
    throw new Error('Impossible de rafraîchir le token Spotify');
  }
  return res.access_token;
}

function renderNowPlayingSVG(nowPlaying) {
  const width = 540;
  const height = 80;

  let line = 'Rien en cours de lecture';
  let artist = '';
  let album = '';
  let progressPercent = 0;

  if (nowPlaying && nowPlaying.item) {
    const item = nowPlaying.item;
    const trackName = sanitizeText(item.name, 60);
    const artistNames = sanitizeText(item.artists.map((a) => a.name).join(', '), 80);
    album = sanitizeText(item.album?.name, 60);
    const isPlaying = nowPlaying.is_playing;
    const prefix = isPlaying ? '🎧' : '⏸️';
    line = `${prefix} ${trackName}`;
    artist = artistNames;

    const dur = item.duration_ms || 0;
    const prog = nowPlaying.progress_ms || 0;
    progressPercent = dur > 0 ? Math.floor((prog / dur) * 100) : 0;
  }

  const bg = '#121212';
  const fg = '#FFFFFF';
  const sub = '#B3B3B3';
  const progress = '#1DB954';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Now Playing">
  <title>Spotify Now Playing</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />
  <text x="16" y="28" fill="${fg}" font-size="18" font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial" font-weight="600">${line}</text>
  <text x="16" y="50" fill="${sub}" font-size="14" font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial">${artist}${album ? ' • ' + album : ''}</text>
  <rect x="16" y="60" width="${width - 32}" height="8" fill="#2A2A2A" rx="4" />
  <rect x="16" y="60" width="${Math.floor((width - 32) * (progressPercent / 100))}" height="8" fill="${progress}" rx="4" />
</svg>`;
}

function renderTopTracksSVG(items) {
  const width = 540;
  const lineHeight = 22;
  const padding = 16;
  const count = Math.min((items?.length || 0), 10);
  const height = padding * 2 + lineHeight * (count + 1);

  const bg = '#121212';
  const fg = '#FFFFFF';
  const sub = '#B3B3B3';

  let lines = '';
  for (let i = 0; i < count; i++) {
    const t = items[i];
    const name = sanitizeText(t.name, 50);
    const artist = sanitizeText(t.artists.map((a) => a.name).join(', '), 60);
    const y = padding + lineHeight * (i + 2);
    lines += `<text x="${padding}" y="${y}" fill="${sub}" font-size="14" font-family="system-ui" >${i + 1}. ${name} — ${artist}</text>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Top Tracks">
  <title>Spotify Top Tracks</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />
  <text x="${padding}" y="${padding + 16}" fill="${fg}" font-size="18" font-family="system-ui" font-weight="600">Top Tracks (4 semaines)</text>
  ${lines}
</svg>`;
}

// 1) Début OAuth: redirige l'utilisateur vers l'écran d'autorisation Spotify
app.get('/connect', (req, res) => {
  // Param optionnel "state" pour prévenir CSRF; on génère un aléatoire simple
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
    // show_dialog: 'true' // si tu veux forcer l’affichage de consentement
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params}`;
  // Pour UX: on renvoie une page HTML avec un bouton
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

// 2) Callback OAuth: échange "code" contre access_token + refresh_token, puis génère JWT
app.get('/callback', async (req, res) => {
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
    const tokenRes = await post('https://accounts.spotify.com/api/token', data, {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    });

    const refreshToken = tokenRes.refresh_token;
    if (!refreshToken) {
      return res.status(400).send('Refresh token introuvable (vérifie les scopes et consentement)');
    }

    // Génère JWT signé avec expiration configurable
    const jwt = signJWT({ rt: refreshToken }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const markdownNP = `![Spotify Now Playing](https://${req.headers.host}/api/now-playing?jwt=${encodeURIComponent(jwt)})`;
    const markdownTT = `![Spotify Top Tracks](https://${req.headers.host}/api/top-tracks?jwt=${encodeURIComponent(jwt)}&limit=10)`;

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

// 3) Endpoints SVG: acceptent jwt=..., le décodent pour récupérer refresh_token sans l’exposer
app.get('/api/now-playing', async (req, res) => {
  try {
    const jwt = req.query.jwt;
    if (!jwt || typeof jwt !== 'string') {
      return res.status(400).send('Paramètre manquant: jwt');
    }

    // Rate limit par jwt
    if (!rateLimit(jwt)) {
      return res.status(429).send('Trop de requêtes');
    }

    const payload = verifyJWT(jwt, JWT_SECRET);
    if (!payload || !payload.rt) {
      return res.status(401).send('JWT invalide ou expiré');
    }

    const accessToken = await refreshAccessToken(payload.rt);
    const nowPlaying = await get('https://api.spotify.com/v1/me/player/currently-playing', {
      Authorization: `Bearer ${accessToken}`,
    });

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

app.get('/api/top-tracks', async (req, res) => {
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

    const accessToken = await refreshAccessToken(payload.rt);

    const top = await get(`https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=${limit}`, {
      Authorization: `Bearer ${accessToken}`,
    });

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spotify OAuth + SVG server listening on ${PORT}`);
});
