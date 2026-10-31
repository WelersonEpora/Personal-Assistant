"use strict";

const equipeService = require("../services/equipe.service");
const { success } = require("../shared/utils/api-response");
const { ValidationError } = require("../shared/errors");

async function obter(req, res) {
  const equipe = await equipeService.obterEquipe(req.equipeId);
  success(res, equipe);
}

async function atualizar(req, res) {
  const equipe = await equipeService.atualizarNome(req.equipeId, (req.body || {}).nome);
  success(res, equipe);
}

async function obterIdentidade(req, res) {
  const identidade = await equipeService.obterIdentidade(req.equipeId);
  success(res, identidade);
}

async function enviarLogo(req, res) {
  if (!req.file) {
    throw new ValidationError('Envie o logo no campo "logo".');
  }
  const equipe = await equipeService.atualizarLogo(req.equipeId, { buffer: req.file.buffer, mimeType: req.file.mimetype });
  success(res, equipe);
}

async function streamLogo(req, res) {
  const { buffer, mimeType } = await equipeService.obterLogo(req.equipeId);
  res.set("Content-Type", mimeType);
  res.send(buffer);
}

async function removerLogo(req, res) {
  const equipe = await equipeService.removerLogo(req.equipeId);
  success(res, equipe);
}

module.exports = { obter, atualizar, obterIdentidade, enviarLogo, streamLogo, removerLogo };
