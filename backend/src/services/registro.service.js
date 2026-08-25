"use strict";

const registroRepository = require("../repositories/registro.repository");
const storageAudio = require("./storage-audio.service");
const { NotFoundError } = require("../shared/errors");

async function listar(usuarioId, { status } = {}) {
  return registroRepository.listarPorUsuario({ usuarioId, status });
}

async function obterDetalhe(usuarioId, registroId) {
  const registro = await registroRepository.obterDetalhado(registroId);
  if (!registro || registro.usuario_id !== usuarioId) {
    throw new NotFoundError("Registro não encontrado.");
  }
  return registro;
}

async function obterAudio(usuarioId, registroId, entradaId) {
  const entrada = await registroRepository.obterEntradaAudioAutorizada({ usuarioId, registroId, entradaId });
  if (!entrada || !entrada.arquivoAudio) {
    throw new NotFoundError("Áudio não encontrado.");
  }
  const buffer = await storageAudio.ler(entrada.arquivoAudio.caminho_armazenamento);
  return { buffer, mimeType: entrada.arquivoAudio.mime_type };
}

module.exports = { listar, obterDetalhe, obterAudio };
