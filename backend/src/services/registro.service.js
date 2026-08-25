"use strict";

const registroRepository = require("../repositories/registro.repository");
const storageAudio = require("./storage-audio.service");
const { NotFoundError } = require("../shared/errors");

async function listar(equipeId, { status } = {}) {
  return registroRepository.listarPorEquipe({ equipeId, status });
}

async function obterDetalhe(equipeId, registroId) {
  const registro = await registroRepository.obterDetalhado(registroId);
  if (!registro || registro.equipe_id !== equipeId) {
    throw new NotFoundError("Registro não encontrado.");
  }
  return registro;
}

async function obterAudio(equipeId, registroId, entradaId) {
  const entrada = await registroRepository.obterEntradaAudioAutorizada({ equipeId, registroId, entradaId });
  if (!entrada || !entrada.arquivoAudio) {
    throw new NotFoundError("Áudio não encontrado.");
  }
  const buffer = await storageAudio.ler(entrada.arquivoAudio.caminho_armazenamento);
  return { buffer, mimeType: entrada.arquivoAudio.mime_type };
}

module.exports = { listar, obterDetalhe, obterAudio };
