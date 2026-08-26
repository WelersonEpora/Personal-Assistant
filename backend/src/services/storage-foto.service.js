"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../config/env");

// Mesmo critério de docs/adr/0010-armazenamento-arquivos-audio.md aplicado à
// foto (avatar) do aluno: disco local em diretório dedicado (volume Docker
// em produção), nunca servido como estático público - só lido via
// services/aluno.service.js, atrás de autenticação e checagem de posse.
const BASE_DIR = path.resolve(__dirname, "..", "..", env.fotoStorageDir);

const EXTENSAO_POR_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const MIME_POR_EXTENSAO = Object.fromEntries(Object.entries(EXTENSAO_POR_MIME).map(([mime, ext]) => [ext, mime]));

function mimeSuportado(mimeType) {
  return Boolean(EXTENSAO_POR_MIME[mimeType]);
}

// Nome do arquivo vem do id do aluno (nunca do nome enviado pelo cliente) -
// elimina risco de path traversal. Reaproveita sempre o mesmo nome por
// aluno, então um novo upload substitui a foto anterior.
async function salvar({ alunoId, buffer, mimeType }) {
  await fs.mkdir(BASE_DIR, { recursive: true });
  const nomeArquivo = `${alunoId}${EXTENSAO_POR_MIME[mimeType]}`;
  await fs.writeFile(path.join(BASE_DIR, nomeArquivo), buffer);
  return nomeArquivo;
}

async function ler(nomeArquivo) {
  const buffer = await fs.readFile(path.join(BASE_DIR, nomeArquivo));
  const mimeType = MIME_POR_EXTENSAO[path.extname(nomeArquivo)] || "application/octet-stream";
  return { buffer, mimeType };
}

module.exports = { salvar, ler, mimeSuportado };
