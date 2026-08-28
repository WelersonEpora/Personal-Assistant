"use strict";

const painelService = require("../services/painel.service");
const { success } = require("../shared/utils/api-response");

async function obter(req, res) {
  const painel = await painelService.obterPainel(req.equipeId);
  success(res, painel);
}

module.exports = { obter };
