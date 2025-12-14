import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Spotify Status API',
      version: '1.0.0',
      description: 'API to generate dynamic SVGs for your Spotify status.',
    },
    servers: [
      {
        url: 'https://spotify-status-md.vercel.app/api-docs/',
      },
    ],
  },
  apis: ['./src/routes.js'], // files containing annotations as above
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
