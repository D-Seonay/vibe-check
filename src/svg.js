// src/svg.js
function sanitizeText(text, maxLen = 100) {
  if (!text) return '';
  const s = String(text).replace(/[<>]/g, '');
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

export function renderNowPlayingSVG(nowPlaying) {
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

export function renderTopTracksSVG(items) {
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
