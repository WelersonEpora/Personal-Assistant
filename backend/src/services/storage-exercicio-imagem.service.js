"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../config/env");

// Mesmo critério de docs/adr/0010-armazenamento-arquivos-audio.md e de
// storage-foto.service.js aplicado à imagem de exercício (docs/adr/0013):
// disco local em diretório dedicado (volume Docker em produção), nunca
// servido como estático público - só lido atrás de autenticação e checagem
// de posse (ver services/exercicio.service.js).
const BASE_DIR = path.resolve(__dirname, "..", "..", env.exercicioImagemStorageDir);

const EXTENSAO_POR_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const MIME_POR_EXTENSAO = Object.fromEntries(Object.entries(EXTENSAO_POR_MIME).map(([mime, ext]) => [ext, mime]));

function mimeSuportado(mimeType) {
  return Boolean(EXTENSAO_POR_MIME[mimeType]);
}

// Nome do arquivo vem de uma chave montada pelo chamador (ex.: "exercicio-<id>"),
// nunca do nome enviado pelo cliente - elimina risco de path traversal.
// Reaproveita sempre o mesmo nome por chave, então um novo upload substitui
// a imagem anterior.
async function salvar({ chave, buffer, mimeType }) {
  await fs.mkdir(BASE_DIR, { recursive: true });
  const nomeArquivo = `${chave}${EXTENSAO_POR_MIME[mimeType]}`;
  await fs.writeFile(path.join(BASE_DIR, nomeArquivo), buffer);
  return nomeArquivo;
}

async function ler(nomeArquivo) {
  const buffer = await fs.readFile(path.join(BASE_DIR, nomeArquivo));
  const mimeType = MIME_POR_EXTENSAO[path.extname(nomeArquivo)] || "application/octet-stream";
  return { buffer, mimeType };
}

// Idempotente: já não ter o arquivo em disco não é erro.
async function remover(nomeArquivo) {
  try {
    await fs.unlink(path.join(BASE_DIR, nomeArquivo));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { salvar, ler, remover, mimeSuportado };
