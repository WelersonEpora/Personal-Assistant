"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../config/env");

// docs/adr/0010-armazenamento-arquivos-audio.md: disco local em diretorio
// dedicado (volume Docker em producao), nunca servido como estatico
// publico - só lido via services/registro.service.js::streamAudio, atrás
// de autenticação e checagem de posse.
const BASE_DIR = path.resolve(__dirname, "..", "..", env.audioStorageDir);

const EXTENSAO_POR_MIME = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav"
};

function extensaoPara(mimeType) {
  return EXTENSAO_POR_MIME[mimeType] || ".bin";
}

// Nome do arquivo vem do id (gerado pelo servidor em registro_entrada),
// nunca do nome enviado pelo cliente - elimina risco de path traversal.
async function salvar({ entradaId, buffer, mimeType }) {
  await fs.mkdir(BASE_DIR, { recursive: true });
  const nomeArquivo = `${entradaId}${extensaoPara(mimeType)}`;
  await fs.writeFile(path.join(BASE_DIR, nomeArquivo), buffer);
  return nomeArquivo;
}

async function ler(caminhoRelativo) {
  return fs.readFile(path.join(BASE_DIR, caminhoRelativo));
}

module.exports = { salvar, ler };
