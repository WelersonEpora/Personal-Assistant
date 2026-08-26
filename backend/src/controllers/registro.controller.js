"use strict";

const registroService = require("../services/registro.service");
const registroSyncService = require("../services/registro-sync.service");
const registroConfirmacaoService = require("../services/registro-confirmacao.service");
const { success } = require("../shared/utils/api-response");
const { ValidationError } = require("../shared/errors");

async function list(req, res) {
  const registros = await registroService.listar(req.equipeId, { status: req.query.status });
  success(res, registros);
}

async function getById(req, res) {
  const registro = await registroService.obterDetalhe(req.equipeId, req.params.id);
  success(res, registro);
}

// multipart/form-data: campo "metadata" (JSON) + um arquivo por entrada de
// áudio, nomeado "audio_<ordem>" (ver docs/adr/0005-estrategia-sincronizacao.md).
async function sincronizar(req, res) {
  let metadata;
  try {
    metadata = JSON.parse(req.body.metadata || "{}");
  } catch (_err) {
    throw new ValidationError('"metadata" precisa ser um JSON válido.');
  }

  const arquivos = new Map();
  for (const arquivo of req.files || []) {
    const match = /^audio_(\d+)$/.exec(arquivo.fieldname);
    if (match) arquivos.set(Number(match[1]), arquivo);
  }

  const registro = await registroSyncService.sincronizar({
    usuarioId: req.usuarioId,
    equipeId: req.equipeId,
    registroId: req.params.id,
    metadata,
    arquivos
  });

  success(res, { id: registro.id, status: registro.status });
}

async function streamAudio(req, res) {
  const { buffer, mimeType } = await registroService.obterAudio(req.equipeId, req.params.id, req.params.entradaId);
  res.set("Content-Type", mimeType);
  res.send(buffer);
}

async function confirmar(req, res) {
  const validacao = await registroConfirmacaoService.confirmar({
    usuarioId: req.usuarioId,
    equipeId: req.equipeId,
    registroId: req.params.id,
    payload: req.body || {}
  });
  success(res, validacao, { statusCode: 201 });
}

async function excluir(req, res) {
  await registroService.excluir(req.equipeId, req.params.id);
  success(res, { id: req.params.id });
}

module.exports = { list, getById, sincronizar, streamAudio, confirmar, excluir };
