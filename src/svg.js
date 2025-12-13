// src/svg.js
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
  <text x="16" y="50" fill="${sub}" font-size="14" font-family="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial">${artist}${
    album ? " • " + album : ""
  }</text>
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

  const bg = "#121212";
  const fg = "#FFFFFF";
  const sub = "#B3B3B3";

  let lines = "";
  for (let i = 0; i < count; i++) {
    const t = items[i];
    const name = sanitizeText(t.name, 50);
    const artist = sanitizeText(t.artists.map((a) => a.name).join(", "), 60);
    const y = padding + lineHeight * (i + 2);
    lines += `
  <text x="${padding}" y="${y}" fill="#B3B3B3" font-size="14" font-family="system-ui">
    ${i + 1}. ${name} — ${artist}${playedAt ? " • " + sanitizeText(playedAt, 40) : ""}
  </text>
`;

  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Top Tracks">
  <title>Spotify Top Tracks</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8" />
  <text x="${padding}" y="${
    padding + 16
  }" fill="${fg}" font-size="18" font-family="system-ui" font-weight="600">Top Tracks (4 semaines)</text>
  ${lines}
</svg>`;
}

// NEW: Recently Played
export function renderRecentTracksSVG(items) {
  const width = 540;
  const padding = 16;
  const lineHeight = 22;

  // Afficher jusqu'à 50 musiques
  const count = Math.min(items?.length || 0, 50);

  // Hauteur dynamique
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
        ${i + 1}. ${name} — ${artist}${playedAt ? " • " + playedAt : ""}
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

// NEW: Top Artists
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
    lines += `<text x="${padding}" y="${y}" fill="#B3B3B3" font-size="14" font-family="system-ui">${
      i + 1
    }. ${name}${genres ? " — " + genres : ""}</text>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Top Artists">
  <title>Spotify Top Artists</title>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8" />
  <text x="${padding}" y="${
    padding + 16
  }" fill="#FFFFFF" font-size="18" font-family="system-ui" font-weight="600">Top Artistes</text>
  ${lines}
</svg>`;
}

// NEW: Compact current status widget
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

// NEW: Profile card
export function renderProfileSVG(profile, imageAsB64, topArtist, topArtistImageB64, options = {}) {
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
  const height = topArtist ? 200 : 100;
  const name = sanitizeText(profile?.display_name || "Utilisateur Spotify", 60);
  const followers = profile?.followers?.total ?? 0;
  const hasImage = imageAsB64 !== null;

  let bgFill = bg_color;
  if (gradient_bg) {
    bgFill = `url(#bgGradient)`;
  }

  let imagePart = '';
  if (hasImage) {
    imagePart = `
    <defs>
      <clipPath id="clipCircle">
        <circle cx="50" cy="50" r="40" />
      </clipPath>
    </defs>
    <image x="10" y="10" width="80" height="80" href="data:image/jpeg;base64,${imageAsB64}" clip-path="url(#clipCircle)" />
    `;
  }

  const textX = hasImage ? 110 : 16;

  let topArtistPart = '';
  if (topArtist) {
    const artistName = sanitizeText(topArtist.name, 40);
    const hasArtistImage = topArtistImageB64 !== null;
    let artistImagePart = '';
    if (hasArtistImage) {
      artistImagePart = `
      <defs>
        <clipPath id="clipCircleArtist">
          <circle cx="330" cy="50" r="40" />
        </clipPath>
      </defs>
      <image x="290" y="10" width="80" height="80" href="data:image/jpeg;base64,${topArtistImageB64}" clip-path="url(#clipCircleArtist)" />
      `;
    }
    topArtistPart = `
      ${artistImagePart}
      <text x="16" y="130" fill="${title_color}" font-size="16" font-family="system-ui" font-weight="600">Top 1 Artiste (ce mois)</text>
      <text x="16" y="155" fill="${subtext_color}" font-size="14" font-family="system-ui">${artistName}</text>
      <text x="16" y="175" fill="${subtext_color}" font-size="12" font-family="system-ui" font-style="italic">Temps d'écoute non disponible via l'API</text>
    `;
  }
  
  let followersPart = '';
  if (show_followers) {
    followersPart = `<text x="${textX}" y="56" fill="${subtext_color}" font-size="14" font-family="system-ui">Followers: ${followers}</text>`;
  }

  let idPart = '';
  if (show_id) {
    idPart = `<text x="${textX}" y="78" fill="${subtext_color}" font-size="12" font-family="system-ui">ID: ${sanitizeText(profile?.id || "", 40)}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Profile">
  <title>Spotify Profile</title>
  ${gradient_bg ? `<defs><linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${gradient_start_color}" /><stop offset="100%" stop-color="${gradient_end_color}" /></linearGradient></defs>`: ''}
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bgFill}" rx="${border_radius}" />
  ${imagePart}
  <text x="${textX}" y="32" fill="${text_color}" font-size="20" font-family="system-ui" font-weight="700">${name}</text>
  ${followersPart}
  ${idPart}
  ${topArtistPart}
</svg>`;
}
