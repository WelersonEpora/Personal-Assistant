"use strict";

const exercicioService = require("../services/exercicio.service");
const { success } = require("../shared/utils/api-response");
const { ValidationError } = require("../shared/errors");

async function list(req, res) {
  const exercicios = await exercicioService.listExercicios(req.equipeId);
  success(res, exercicios);
}

async function getById(req, res) {
  const exercicio = await exercicioService.getExercicio(req.equipeId, req.params.id);
  success(res, exercicio);
}

async function create(req, res) {
  const exercicio = await exercicioService.createExercicio(req.equipeId, req.body || {});
  success(res, exercicio, { statusCode: 201 });
}

async function update(req, res) {
  const exercicio = await exercicioService.updateExercicio(req.equipeId, req.params.id, req.body || {});
  success(res, exercicio);
}

async function excluir(req, res) {
  await exercicioService.excluirExercicio(req.equipeId, req.params.id);
  success(res, { id: req.params.id });
}

async function enviarImagem(req, res) {
  if (!req.file) {
    throw new ValidationError('Envie a imagem no campo "imagem".');
  }
  const exercicio = await exercicioService.atualizarImagem(req.equipeId, req.params.id, req.params.posicao, {
    buffer: req.file.buffer,
    mimeType: req.file.mimetype
  });
  success(res, exercicio);
}

async function streamImagem(req, res) {
  const { buffer, mimeType } = await exercicioService.obterImagem(req.equipeId, req.params.id, req.params.posicao);
  res.set("Content-Type", mimeType);
  res.send(buffer);
}

async function removerImagem(req, res) {
  const exercicio = await exercicioService.removerImagem(req.equipeId, req.params.id, req.params.posicao);
  success(res, exercicio);
}

module.exports = { list, getById, create, update, excluir, enviarImagem, streamImagem, removerImagem };
