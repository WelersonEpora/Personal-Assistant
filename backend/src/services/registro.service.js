"use strict";

const { Op } = require("sequelize");
const registroRepository = require("../repositories/registro.repository");
const storageAudio = require("./storage-audio.service");
const { enfileirarRegistro } = require("../jobs/processador-fila-ia");
const { NotFoundError, ConflictError, ValidationError } = require("../shared/errors");
const { validarDataIso } = require("../shared/utils/periodo");

const { Registro } = registroRepository;
const STATUS_REPROCESSAVEIS = new Set([Registro.STATUS.ERRO_TRANSCRICAO, Registro.STATUS.ERRO_INTERPRETACAO]);

// Filtros opcionais (docs/adr/0019 - janela por `data_atendimento`). O Histórico
// abre com "Últimos 90 dias" e passa `tipo = atendimento`; sem filtro, mantém o
// comportamento antigo (usado pela fila de revisão e pelo badge da navegação).
//
// `status = "abertos"` (docs/adr/0020, adendo): a tela de Relatos é a caixa de
// entrada do pipeline - mostra tudo que ainda não virou dado oficial. Um
// Registro confirmado sai dali e passa a viver só no Histórico. Qualquer outro
// valor continua sendo filtro por status exato.
function resolverStatus(status) {
  if (!status) return undefined;
  if (status === "abertos") return { [Op.ne]: Registro.STATUS.CONFIRMADO };
  return status;
}

async function listar(equipeId, { status, de, ate, alunoId, tipo } = {}) {
  const deValido = de ? validarDataIso(String(de), "de") : null;
  const ateValido = ate ? validarDataIso(String(ate), "ate") : null;
  if (deValido && ateValido && deValido > ateValido) {
    throw new ValidationError('"de" não pode ser depois de "ate".');
  }
  if (tipo && !Registro.TIPOS[tipo.toUpperCase()]) {
    throw new ValidationError('"tipo" deve ser "atendimento" ou "avaliacao_fisica".');
  }
  return registroRepository.listarPorEquipe({
    equipeId,
    status: resolverStatus(status),
    de: deValido,
    ate: ateValido,
    alunoId: alunoId || null,
    tipo: tipo || null
  });
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

// Reprocessamento manual (botão "Tentar novamente" na revisão): Registros
// que pararam em erro_transcricao/erro_interpretacao voltam para a fila -
// processarRegistro (jobs/processador-fila-ia.js) já pula transcrições com
// status "concluida", então retomar não repete trabalho que já deu certo.
//
// docs/adr/0018 - para tipo = avaliacao_fisica, "Refazer interpretação" também
// vale a partir de aguardando_revisao (proposta ruim, mas sem erro): nada
// oficial foi criado ainda (a avaliacao_fisica só nasce da confirmação), então
// regenerar a proposta é seguro. Para tipo = atendimento isso fica fora de
// escopo - um relato aguardando revisão não volta para a fila por aqui.
function podeReprocessar(registro) {
  if (STATUS_REPROCESSAVEIS.has(registro.status)) return true;
  return registro.tipo === Registro.TIPOS.AVALIACAO_FISICA && registro.status === Registro.STATUS.AGUARDANDO_REVISAO;
}

async function reprocessar(equipeId, registroId) {
  const registro = await registroRepository.obterPorIdEquipe({ id: registroId, equipeId });
  if (!registro) {
    throw new NotFoundError("Registro não encontrado.");
  }
  if (!podeReprocessar(registro)) {
    throw new ConflictError("Só é possível reprocessar um Registro com falha de transcrição ou interpretação.");
  }
  await registroRepository.atualizarStatus(registroId, Registro.STATUS.RECEBIDO);
  enfileirarRegistro(registroId);
  return { id: registroId, status: Registro.STATUS.RECEBIDO };
}

module.exports = { listar, obterDetalhe, obterAudio, excluir, reprocessar };
