"use strict";

const registroRepository = require("../repositories/registro.repository");
const storageAudio = require("./storage-audio.service");
const { enfileirarRegistro } = require("../jobs/processador-fila-ia");
const { NotFoundError, ConflictError } = require("../shared/errors");

const { Registro } = registroRepository;
const STATUS_REPROCESSAVEIS = new Set([Registro.STATUS.ERRO_TRANSCRICAO, Registro.STATUS.ERRO_INTERPRETACAO]);

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

// Reprocessamento manual (botão "Tentar novamente" na revisão): só
// Registros que pararam em erro_transcricao/erro_interpretacao podem
// voltar para a fila - processarRegistro (jobs/processador-fila-ia.js) já
// pula transcrições com status "concluida", então retomar não repete
// trabalho que já deu certo antes da falha.
async function reprocessar(equipeId, registroId) {
  const registro = await registroRepository.obterPorIdEquipe({ id: registroId, equipeId });
  if (!registro) {
    throw new NotFoundError("Registro não encontrado.");
  }
  if (!STATUS_REPROCESSAVEIS.has(registro.status)) {
    throw new ConflictError('Só é possível reprocessar um Registro com falha de transcrição ou interpretação.');
  }
  await registroRepository.atualizarStatus(registroId, Registro.STATUS.RECEBIDO);
  enfileirarRegistro(registroId);
  return { id: registroId, status: Registro.STATUS.RECEBIDO };
}

module.exports = { listar, obterDetalhe, obterAudio, excluir, reprocessar };
