import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Fix for __dirname in ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ---------------------------------------

const profileTemplate = fs.readFileSync(path.resolve(__dirname, 'profile.ejs'), 'utf8');
const callbackPreviewTemplate = fs.readFileSync(path.resolve(__dirname, 'callback_preview.ejs'), 'utf8');
const connectTemplate = fs.readFileSync(path.resolve(__dirname, 'connect.ejs'), 'utf8');
const mosaicTemplate = fs.readFileSync(path.resolve(__dirname, 'mosaic.ejs'), 'utf8');

function sanitizeText(str, maxLength = 100) {
  return [...String(str)]
    .slice(0, maxLength)
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const THEMES = {
  dark: {
    bg: "#121212",
    fg: "#FFFFFF",
    sub: "#B3B3B3",
    progress: "#1DB954",
    barBg: "#2A2A2A",
    statusText: "#1DB954"
  },
  light: {
    bg: "#FFFFFF",
    fg: "#191414",
    sub: "#5E5E5E",
    progress: "#1DB954",
    barBg: "#E0E0E0",
    statusText: "#1DB954"
  }
};

export function getTheme(themeName) {
  return THEMES[themeName] || THEMES.dark;
}

export function renderNowPlayingSVG(nowPlaying, themeName = 'dark') {
  const { bg, fg, sub, progress, barBg } = getTheme(themeName);
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="VibeCheck Now Playing">
  <title>VibeCheck Now Playing</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />
  <text x="16" y="28" fill="${fg}" font-size="18" font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial" font-weight="600">${line}</text>
  <text x="16" y="50" fill="${sub}" font-size="14" font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial">${artist}${album ? " • " + album : ""}</text>
  <rect x="16" y="60" width="${width - 32}" height="8" fill="${barBg}" rx="4" />
  <rect x="16" y="60" width="${Math.floor(
    (width - 32) * (progressPercent / 100)
  )}" height="8" fill="${progress}" rx="4" />
</svg>`;
}

export function renderTopTracksSVG(items, themeName = 'dark') {
  const { bg, fg, sub } = getTheme(themeName);
  const width = 540;
  const lineHeight = 22;
  const padding = 16;
  const count = Math.min(items?.length || 0, 10);
  const height = padding * 2 + lineHeight * (count + 1);

  let lines = "";
  for (let i = 0; i < count; i++) {
    const t = items[i];
    const name = sanitizeText(t.name, 50);
    const artist = sanitizeText(t.artists.map((a) => a.name).join(", "), 60);
    const y = padding + lineHeight * (i + 2);
    lines += `
  <text x="${padding}" y="${y}" fill="${sub}" font-size="14" font-family="system-ui">
    ${i + 1}. ${name} — ${artist}
  </text>
`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="VibeCheck Top Tracks">
  <title>VibeCheck Top Tracks</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />
  <text x="${padding}" y="${padding + 16}" fill="${fg}" font-size="18" font-family="system-ui" font-weight="600">Top Tracks (4 semaines)</text>
  ${lines}
</svg>`;
}

export function renderRecentTracksSVG(items, themeName = 'dark') {
  const { bg, fg, sub } = getTheme(themeName);
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
      <text x="${padding}" y="${y}" fill="${sub}" font-size="14" font-family="system-ui">
        ${i + 1}. ${name} — ${artist}${playedAt ? " • " + playedAt : ""}
      </text>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
  xmlns="http://www.w3.org/2000/svg" role="img" aria-label="VibeCheck Recently Played">
  <title>VibeCheck Recently Played</title>

  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />

  <text x="${padding}" y="${padding + 16}" fill="${fg}"
    font-size="18" font-family="system-ui" font-weight="600">
    Titres récemment écoutés
  </text>

  ${lines}
</svg>`;
}

export function renderTopArtistsSVG(items, themeName = 'dark') {
  const { bg, fg, sub } = getTheme(themeName);
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
    lines += `<text x="${padding}" y="${y}" fill="${sub}" font-size="14" font-family="system-ui">${i + 1}. ${name}${genres ? " — " + genres : ""}</text>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="VibeCheck Top Artists">
  <title>VibeCheck Top Artists</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />
  <text x="${padding}" y="${padding + 16}" fill="${fg}" font-size="18" font-family="system-ui" font-weight="600">Top Artistes</text>
  ${lines}
</svg>`;
}

export function renderCurrentStatusSVG(nowPlaying, themeName = 'dark') {
  const { bg, fg, sub, statusText } = getTheme(themeName);
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
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="VibeCheck Status">
  <title>VibeCheck Status</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}" rx="8" />
  <text x="12" y="22" fill="${statusText}" font-size="14" font-family="system-ui" font-weight="600">${status}</text>
  <text x="12" y="38" fill="${fg}" font-size="14" font-family="system-ui">${line1}</text>
  <text x="12" y="52" fill="${sub}" font-size="12" font-family="system-ui">${line2}</text>
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

  const name = sanitizeText(profile?.display_name || "Utilisateur VibeCheck", 60);
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

export function renderConnectPage(data) {
  return ejs.render(connectTemplate, data);
}

export function renderListeningMosaicSVG(listeningHistory) {
  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setFullYear(today.getFullYear() - 1);

  const days = new Array(365).fill(0);
  const dayCounts = {};

  for (const item of listeningHistory) {
    const playedAt = new Date(item.played_at);
    if (playedAt >= yearAgo) {
      const dayOfYear = Math.floor((playedAt - new Date(playedAt.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
      const dateString = playedAt.toISOString().split('T')[0];
      dayCounts[dateString] = (dayCounts[dateString] || 0) + 1;
    }
  }

  const weeks = Array.from({ length: 53 }, () => new Array(7).fill(null));
  const monthLabels = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let maxCount = 0;
  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = date.toISOString().split('T')[0];
    const count = dayCounts[dateString] || 0;
    if (count > maxCount) maxCount = count;
  }

  const colorLevels = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
  const getColor = (count) => {
    if (count === 0) return colorLevels[0];
    const level = Math.ceil((count / maxCount) * (colorLevels.length - 2));
    return colorLevels[level + 1];
  };

  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dayOfWeek = (date.getDay() + 6) % 7; // Monday = 0
    const weekIndex = 52 - Math.floor((today - date) / (1000 * 60 * 60 * 24 * 7));

    if (weeks[weekIndex]) {
      const count = dayCounts[date.toISOString().split('T')[0]] || 0;
      weeks[weekIndex][dayOfWeek] = {
        count,
        color: getColor(count),
      };
    }
    
    if (date.getDate() === 1) {
        monthLabels.push({
            name: monthNames[date.getMonth()],
            x: weekIndex * 14
        });
    }
  }

  return ejs.render(mosaicTemplate, {
    weeks,
    monthLabels,
  });
}