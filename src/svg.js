import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Added for ES Module compatibility
import { sanitizeText } from './utils.js';

// --- Fix for __dirname in ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ---------------------------------------

const profileTemplate = fs.readFileSync(path.resolve(__dirname, 'profile.ejs'), 'utf8');
const callbackPreviewTemplate = fs.readFileSync(path.resolve(__dirname, 'callback_preview.ejs'), 'utf8');

export function renderNowPlayingSVG(nowPlaying) {
  const width = 540;
  const height = 80;

  let line = "Rien en cours de lecture";
  let artist = "";
  let album = "";
  let progressPercent = 0;

  if (nowPlaying && nowPlaying.item) {
    const item = nowPlaying.item;
    const trackName = sanitizeText(item.name, 60);
    const artistNames = sanitizeText(
      item.artists.map((a) => a.name).join(", "),
      80
    );
    album = sanitizeText(item.album?.name, 60);
    const isPlaying = nowPlaying.is_playing;
    const prefix = isPlaying ? "🎧" : "⏸️";
    line = `${prefix} ${trackName}`;
    artist = artistNames;

    const dur = item.duration_ms || 0;
    const prog = nowPlaying.progress_ms || 0;
    progressPercent = dur > 0 ? Math.floor((prog / dur) * 100) : 0;
  }

  const bg = "#121212";
  const fg = "#FFFFFF";
  const sub = "#B3B3B3";
  const progress = "#1DB954";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Now Playing">
  <title>Spotify Now Playing</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />
  <text x="16" y="28" fill="${fg}" font-size="18" font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial" font-weight="600">${line}</text>
  <text x="16" y="50" fill="${sub}" font-size="14" font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial">${artist}${album ? " • " + album : ""}</text>
  <rect x="16" y="60" width="${width - 32}" height="8" fill="#2A2A2A" rx="4" />
  <rect x="16" y="60" width="${Math.floor(
    (width - 32) * (progressPercent / 100)
  )}" height="8" fill="${progress}" rx="4" />
</svg>`;
}

export function renderTopTracksSVG(items) {
  const width = 540;
  const lineHeight = 22;
  const padding = 16;
  const count = Math.min(items?.length || 0, 10);
  const height = padding * 2 + lineHeight * (count + 1);

  const fg = "#FFFFFF";

  let lines = "";
  for (let i = 0; i < count; i++) {
    const t = items[i];
    const name = sanitizeText(t.name, 50);
    const artist = sanitizeText(t.artists.map((a) => a.name).join(", "), 60);
    const y = padding + lineHeight * (i + 2);
    lines += `
  <text x="${padding}" y="${y}" fill="#B3B3B3" font-size="14" font-family="system-ui">
    ${i + 1}. ${name} — ${artist}
  </text>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Top Tracks">
  <title>Spotify Top Tracks</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8" />
  <text x="${padding}" y="${padding + 16}" fill="${fg}" font-size="18" font-family="system-ui" font-weight="600">Top Tracks (4 semaines)</text>
  ${lines}
</svg>`;
}

export function renderRecentTracksSVG(items) {
  const width = 540;
  const padding = 16;
  const lineHeight = 22;
  const count = Math.min(items?.length || 0, 50);
  const height = padding * 2 + lineHeight * (count + 1);

  let lines = "";
  for (let i = 0; i < count; i++) {
    const t = items[i];
    const name = sanitizeText(t.track?.name || t.name || "", 50);
    const artist = sanitizeText(
      (t.track?.artists || t.artists || []).map((a) => a.name).join(", "),
      60
    );
    const playedAt = t.played_at
      ? new Date(t.played_at).toLocaleString("fr-FR")
      : "";
    const y = padding + lineHeight * (i + 2);

    lines += `
      <text x="${padding}" y="${y}" fill="#B3B3B3" font-size="14" font-family="system-ui">
        ${i + 1}. ${name} — ${artist}${playedAt ? " • " + sanitizeText(playedAt, 40) : ""}
      </text>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Recently Played">
  <title>Spotify Recently Played</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8" />
  <text x="${padding}" y="${padding + 16}" fill="#FFFFFF"
    font-size="18" font-family="system-ui" font-weight="600">
    Titres récemment écoutés
  </text>
  ${lines}
</svg>`;
}

export function renderTopArtistsSVG(items) {
  const width = 540;
  const padding = 16;
  const lineHeight = 22;
  const count = Math.min(items?.length || 0, 10);
  const height = padding * 2 + lineHeight * (count + 1);

  let lines = "";
  for (let i = 0; i < count; i++) {
    const a = items[i];
    const name = sanitizeText(a.name, 50);
    const genres = sanitizeText((a.genres || []).slice(0, 3).join(", "), 60);
    const y = padding + lineHeight * (i + 2);
    lines += `<text x="${padding}" y="${y}" fill="#B3B3B3" font-size="14" font-family="system-ui">${i + 1}. ${name}${genres ? " — " + genres : ""}</text>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Top Artists">
  <title>Spotify Top Artists</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8" />
  <text x="${padding}" y="${padding + 16}" fill="#FFFFFF" font-size="18" font-family="system-ui" font-weight="600">Top Artistes</text>
  ${lines}
</svg>`;
}

export function renderCurrentStatusSVG(nowPlaying) {
  const width = 360;
  const height = 60;

  let status = "⏹️ Inactif";
  let line1 = "Aucun titre";
  let line2 = "";

  if (nowPlaying && nowPlaying.item) {
    const item = nowPlaying.item;
    const isPlaying = !!nowPlaying.is_playing;
    status = isPlaying ? "▶️ En lecture" : "⏸️ Pause";
    line1 = sanitizeText(item.name, 36);
    line2 = sanitizeText(item.artists.map((a) => a.name).join(", "), 40);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Status">
  <title>Spotify Status</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8" />
  <text x="12" y="22" fill="#1DB954" font-size="14" font-family="system-ui" font-weight="600">${status}</text>
  <text x="12" y="38" fill="#FFFFFF" font-size="14" font-family="system-ui">${line1}</text>
  <text x="12" y="52" fill="#B3B3B3" font-size="12" font-family="system-ui">${line2}</text>
</svg>`;
}

export function renderProfileSVG(profile, imageAsB64, topArtists, topTracks, options = {}) {
  const {
    bg_color = '#121212',
    text_color = '#FFFFFF',
    subtext_color = '#B3B3B3',
    title_color = '#FFFFFF',
    show_id = true,
    show_followers = true,
    gradient_bg = false,
    gradient_start_color = '#444444',
    gradient_end_color = '#121212',
    border_radius = 8,
  } = options;

  const width = 540;
  let height = 100;
  if(topArtists.length > 0) height = 300;
  if(topTracks.length > 0) height = 480;

  const name = sanitizeText(profile?.display_name || "Utilisateur Spotify", 60);
  const followers = profile?.followers?.total ?? 0;
  const hasImage = imageAsB64 !== null;

  let bgFill = bg_color;
  if (gradient_bg) {
    bgFill = `url(#bgGradient)`;
  }

  const textX = hasImage ? 110 : 16;
  const profileId = sanitizeText(profile?.id || "", 40);

  const artists = topArtists.map(artist => ({
    ...artist,
    name: sanitizeText(artist.name, 40),
  }));

  const tracks = topTracks.map(track => ({
    ...track,
    name: sanitizeText(track.name, 40),
    artist: sanitizeText(track.artists.map(a => a.name).join(', '), 30),
  }));

  return ejs.render(profileTemplate, {
    width,
    height,
    gradient_bg,
    gradient_start_color,
    gradient_end_color,
    bgFill,
    border_radius,
    hasImage,
    imageAsB64,
    textX,
    name,
    text_color,
    show_followers,
    subtext_color,
    followers,
    show_id,
    profileId,
    topArtists: artists,
    topTracks: tracks,
    title_color,
  });
}

export function renderCallbackPreviewHTML(data) {
  return ejs.render(callbackPreviewTemplate, data);
}