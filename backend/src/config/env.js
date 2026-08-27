"use strict";

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

const requiredKeys = ["POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "JWT_SECRET"];

requiredKeys.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  appPort: Number(process.env.APP_PORT || 3000),
  db: {
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.NODE_ENV === "test" ? process.env.POSTGRES_DB_TEST || "personal_assistant_test" : process.env.POSTGRES_DB,
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "12h"
  },
  // Pipeline de IA (docs/adr/0006-provedor-ia-gemini.md) - deliberadamente
  // FORA de requiredKeys: sem GEMINI_API_KEY o resto do backend (auth,
  // alunos, captura/sincronizacao) continua funcionando normalmente: so o
  // processamento de IA de cada Registro falha, de forma isolada por
  // Registro (services/ia/gemini.service.js), nunca no boot da aplicacao.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || null,
    model: process.env.GEMINI_MODEL || "gemini-flash-latest"
  },
  // docs/adr/0010-armazenamento-arquivos-audio.md - caminho relativo a
  // backend/ em dev; em producao e o ponto de montagem do volume Docker.
  audioStorageDir: process.env.AUDIO_STORAGE_DIR || "storage/audio",
  // Mesmo critério do audioStorageDir, para a foto (avatar) do aluno.
  fotoStorageDir: process.env.FOTO_STORAGE_DIR || "storage/fotos",
  // Mesmo critério, para a imagem de exercício (docs/adr/0013).
  exercicioImagemStorageDir: process.env.EXERCICIO_IMAGEM_STORAGE_DIR || "storage/exercicios"
};
