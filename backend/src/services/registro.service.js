"use strict";

const registroRepository = require("../repositories/registro.repository");
const storageAudio = require("./storage-audio.service");
const { NotFoundError, ConflictError } = require("../shared/errors");

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

// Soft-delete (docs/adr/0007): só Registros ainda não confirmados podem ser
// excluídos - depois de "confirmado" o Registro já virou Validacao, dado
// oficial do histórico do aluno.
async function excluir(equipeId, registroId) {
  const registro = await registroRepository.obterPorIdEquipe({ id: registroId, equipeId });
  if (!registro) {
    throw new NotFoundError("Registro não encontrado.");
  }
  if (registro.status === "confirmado") {
    throw new ConflictError("Um Registro confirmado não pode ser excluído.");
  }
  await registroRepository.marcarComoExcluido({ id: registroId, equipeId });
}

module.exports = { listar, obterDetalhe, obterAudio, excluir };
