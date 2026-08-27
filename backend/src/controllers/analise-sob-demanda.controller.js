"use strict";

const analiseSobDemandaService = require("../services/analise-sob-demanda.service");
const { success } = require("../shared/utils/api-response");

async function listar(req, res) {
  const { analises, disponibilidade } = await analiseSobDemandaService.listar({
    equipeId: req.equipeId,
    alunoId: req.params.id
  });
  success(res, analises, { meta: { disponibilidade } });
}

// Solicitação de análise sob demanda (docs/adr/0015). 409 quando ainda
// dentro da janela de 7 dias desde a última análise gerada.
async function solicitar(req, res) {
  const analise = await analiseSobDemandaService.solicitar({
    equipeId: req.equipeId,
    alunoId: req.params.id,
    usuarioId: req.usuarioId
  });
  success(res, analise, { statusCode: 201 });
}

module.exports = { listar, solicitar };
