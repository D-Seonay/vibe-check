// src/server.js
import express from 'express';
import dotenv from 'dotenv';
import { createRouter } from './routes.js';

dotenv.config();

const app = express();

const {
  SPOTIFY_CLIENT_ID: CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI: REDIRECT_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN = '30d',
  RATE_LIMIT_WINDOW_MS = '60000',
  RATE_LIMIT_MAX = '60',
  HOST_FOR_MARKDOWN, // optionnel: override host dans markdown
  PORT = '3000',
} = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !JWT_SECRET) {
  console.error('Env manquantes: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, JWT_SECRET');
  process.exit(1);
}

app.use(
  createRouter({
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    RATE_LIMIT_WINDOW_MS: Number(RATE_LIMIT_WINDOW_MS),
    RATE_LIMIT_MAX: Number(RATE_LIMIT_MAX),
    hostForMarkdown: HOST_FOR_MARKDOWN,
  })
);

app.listen(Number(PORT), () => {
  console.log(`Spotify OAuth + SVG server listening on ${PORT}`);
});
