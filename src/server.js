import express from 'express';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';
import { createRouter } from './routes.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

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

// Vérification des variables obligatoires
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !JWT_SECRET) {
  console.error('❌ Erreur: Env manquantes. Vérifiez SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, JWT_SECRET dans le fichier .env');
  process.exit(1);
}


app.get('/api-docs', (req, res) => {
  res.redirect('/api-docs/');
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// -----------------------

// Montage des routes de l'application
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
  console.log(`✅ Server Spotify SVG démarré sur http://localhost:${PORT}`);
  console.log(`📄 Documentation disponible sur http://localhost:${PORT}/api-docs/`);
});
