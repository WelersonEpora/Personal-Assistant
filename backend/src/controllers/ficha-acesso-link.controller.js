"use strict";

const fichaAcessoLinkService = require("../services/fichaAcessoLink.service");
const { success } = require("../shared/utils/api-response");

async function obter(req, res) {
  const link = await fichaAcessoLinkService.obter(req.equipeId, req.params.id);
  success(res, link);
}

async function gerar(req, res) {
  const link = await fichaAcessoLinkService.gerar(req.equipeId, req.usuarioId, req.params.id, req.body || {});
  success(res, link, { statusCode: 201 });
}

async function revogar(req, res) {
  await fichaAcessoLinkService.revogar(req.equipeId, req.params.id);
  success(res, { alunoId: req.params.id });
}

module.exports = { obter, gerar, revogar };
