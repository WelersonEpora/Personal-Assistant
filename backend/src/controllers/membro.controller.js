"use strict";

const membroService = require("../services/membro.service");
const { success } = require("../shared/utils/api-response");
const { ValidationError } = require("../shared/errors");

async function list(req, res) {
  const membros = await membroService.listarMembros(req.equipeId);
  success(res, membros);
}

async function create(req, res) {
  const membro = await membroService.criarMembro(req.equipeId, req.body || {});
  success(res, membro, { statusCode: 201 });
}

async function update(req, res) {
  const membro = await membroService.atualizarMembro(req.equipeId, req.params.id, req.body || {});
  success(res, membro);
}

async function enviarFoto(req, res) {
  if (!req.file) {
    throw new ValidationError('Envie a foto no campo "foto".');
  }
  const membro = await membroService.atualizarFotoMembro(req.equipeId, req.params.id, { buffer: req.file.buffer, mimeType: req.file.mimetype });
  success(res, membro);
}

async function streamFoto(req, res) {
  const { buffer, mimeType } = await membroService.obterFotoMembro(req.equipeId, req.params.id);
  res.set("Content-Type", mimeType);
  res.send(buffer);
}

async function removerFoto(req, res) {
  const membro = await membroService.removerFotoMembro(req.equipeId, req.params.id);
  success(res, membro);
}

module.exports = { list, create, update, enviarFoto, streamFoto, removerFoto };
