"use strict";

const equipeService = require("../services/equipe.service");
const { success } = require("../shared/utils/api-response");

async function obter(req, res) {
  const equipe = await equipeService.obterEquipe(req.equipeId);
  success(res, equipe);
}

async function atualizar(req, res) {
  const equipe = await equipeService.atualizarNome(req.equipeId, (req.body || {}).nome);
  success(res, equipe);
}

module.exports = { obter, atualizar };
