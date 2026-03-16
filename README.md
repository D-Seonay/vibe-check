# VibeCheck for README.md

Generate dynamic VibeCheck images (Now Playing and Top Tracks) that anyone can embed in their GitHub README.md using a single URL. Users connect their Spotify once, get a secure JWT, and paste the provided Markdown line into their README.

## Features
- OAuth “Connect” flow to obtain Spotify refresh_token securely
- JWT-signed token in URL (no refresh_token exposed)
- SVG endpoints:
  - `/api/now-playing?token=...`xx
  - `/api/top-tracks?token=...&limit=10`
- Rate limiting and basic sanitization
- Stateless server (no DB needed)

---

## Quick Start

1) Clone and install:
```
git clone https://github.com/D-Seonay/spotify-status-md.git
cd spotify-status-md
npm install
```

2) Configure environment:
Create a `.env` file (do not commit):
```
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx
SPOTIFY_REDIRECT_URI=https://your-domain.com/callback
JWT_SECRET=change-this-to-a-long-random-secret
JWT_EXPIRES_IN=30d
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
```

3) Set the Redirect URI in your Spotify app:
- Go to https://developer.spotify.com → Dashboard → Your App
- Add Redirect URI: exactly the same as `SPOTIFY_REDIRECT_URI` (e.g., `https://your-domain.com/callback`)
- Scopes used: `user-read-currently-playing`, `user-read-playback-state`, `user-top-read`

4) Run locally:
```
npm start
```
Server listens on `http://localhost:3000`

---

## Deploy

You can deploy on Vercel, Render, Railway, Fly.io, etc.

- Ensure your deployment has HTTPS.
- Set the environment variables in your hosting platform.
- Update `SPOTIFY_REDIRECT_URI` to match your public URL, e.g.:
  - `https://your-domain.com/callback`

---

## User Flow (what your users will do)

1) Visit:
```
https://your-domain.com/connect
```
2) Authorize with Spotify when prompted.
3) After redirect, the page shows ready-to-copy Markdown snippets containing a JWT:
```
![Spotify Now Playing](https://your-domain.com/api/now-playing?token=<paste-your-jwt>)
![Spotify Top Tracks](https://your-domain.com/api/top-tracks?token=<paste-your-jwt>&limit=10)
```
4) Paste one of these lines into your GitHub README.md. Done.

Note: The JWT expires according to `JWT_EXPIRES_IN` (default 30 days). Users can revisit `/connect` to generate a new one.

---

## Endpoints

- GET `/connect`
  - Starts the OAuth flow (shows an “Authorize with Spotify” button).

- GET `/callback?code=...`
  - Spotify callback. Exchanges code for `refresh_token`, returns a web page showing Markdown snippets with a signed JWT.

- GET `/api/now-playing?token=...`
  - Returns an SVG image with current track and progress bar.
  - Content-Type: `image/svg+xml`
  - Cache-Control: `no-cache, no-store, must-revalidate`

- GET `/api/top-tracks?token=...&limit=10`
  - Returns an SVG with top tracks (short_term ~ 4 weeks).
  - `limit`: 1–10
  - Content-Type: `image/svg+xml`
  - Cache-Control: `no-cache, no-store, must-revalidate`

---

## Configuration Details

- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`
  - From your Spotify Developer app.

- `SPOTIFY_REDIRECT_URI`
  - Must match exactly what’s set in your Spotify app. Example: `https://your-domain.com/callback`.

- `JWT_SECRET`
  - A long random string. Used to sign JWT (HS256).

- `JWT_EXPIRES_IN`
  - JWT expiration (e.g., `30d`, `12h`, `3600s`). Users must renew via `/connect` after expiration.

- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`
  - Simple per-token rate limiter. Tune based on your hosting constraints.

---

## Security Notes

- Do not log secrets or tokens.
- Use HTTPS in production.
- The README URL contains a JWT, not the raw refresh_token. The JWT is signed and expires, but it’s still public. Treat it as bearer-like access to read playback/top tracks via this service.
- For stronger protection, you can:
  - Shorten `JWT_EXPIRES_IN`
  - Rotate `JWT_SECRET` periodically
  - Implement encrypted payloads (e.g., AES-GCM) in addition to signing
  - Or move to an account-based model where you store refresh_tokens privately server-side and issue non-sensitive public IDs

---

## Development

- Start: `npm start`
- Code entry: `server.js`
- Modify SVG rendering in:
  - `renderNowPlayingSVG()`
  - `renderTopTracksSVG()`

---

## Troubleshooting

- “Refresh token introuvable” on callback:
  - Check that `SPOTIFY_REDIRECT_URI` matches exactly in Spotify dashboard.
  - Ensure scopes include `user-read-currently-playing`, `user-read-playback-state`, `user-top-read`.
  - Try `show_dialog=true` to force consent if needed.

- SVG not updating / stale image in GitHub:
  - GitHub may cache images; we send no-cache headers, but refresh cadence can vary.
  - Try changing query params (e.g., append `&t=<timestamp>`) if you need manual refresh.

- 401 “JWT invalide ou expiré”:
  - Revisit `/connect` to generate a new token.
  - Ensure `JWT_SECRET` didn’t change since token issuance.

---

## License

MIT. Contributions welcome.