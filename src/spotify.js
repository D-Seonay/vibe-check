// src/spotify.js
import querystring from 'querystring';
import { post, get } from './http.js';

export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const data = querystring.stringify({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await post('https://accounts.spotify.com/api/token', data, {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${basic}`,
  });
  if (!res.access_token) {
    throw new Error('Impossible de rafraîchir le token VibeCheck');
  }
  return res.access_token;
}

export async function getCurrentlyPlaying(accessToken) {
  return await get('https://api.spotify.com/v1/me/player/currently-playing', {
    Authorization: `Bearer ${accessToken}`,
  });
}

export async function getTopTracks(accessToken, { timeRange = 'short_term', limit = 5 } = {}) {
  return await get(`https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=${limit}`, {
    Authorization: `Bearer ${accessToken}`,
  });
}

// NEW: recently played tracks (requires user-read-recently-played, implicitly covered by playback scopes in many apps,
// but if 401, add the scope explicitly in /connect if needed)
export async function getRecentlyPlayed(accessToken, { limit = 50 } = {}) {
  return await get(`https://api.spotify.com/v1/me/player/recently-played?limit=${Math.max(1, Math.min(50, limit))}`, {
    Authorization: `Bearer ${accessToken}`,
  });
}

// NEW: top artists
export async function getTopArtists(accessToken, { timeRange = 'short_term', limit = 5 } = {}) {
  return await get(`https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=${Math.max(1, Math.min(10, limit))}`, {
    Authorization: `Bearer ${accessToken}`,
  });
}

// NEW: profile info
export async function getMe(accessToken) {
  return await get('https://api.spotify.com/v1/me', {
    Authorization: `Bearer ${accessToken}`,
  });
}
