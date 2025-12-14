import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Spotify Status API",
      version: "1.0.0",
      description: "API to generate dynamic SVGs for your Spotify status.",
    },
    servers: [
      {
        url: "/", // Utilise la racine relative (fonctionne partout)
        description: "Serveur actuel",
      },
    ],
  },
  apis: ["./src/routes.js"], // files containing annotations as above
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
