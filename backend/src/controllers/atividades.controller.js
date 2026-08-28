"use strict";

const atividadesService = require("../services/atividades.service");
const { success } = require("../shared/utils/api-response");

// docs/adr/0020 - relatório de atividade por período, somente leitura,
// escopado pela equipe do token.
async function obter(req, res) {
  const atividades = await atividadesService.obterAtividades(req.equipeId, req.query || {});
  success(res, atividades);
}

module.exports = { obter };
