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
    throw new Error('Impossible de rafraîchir le token Spotify');
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
