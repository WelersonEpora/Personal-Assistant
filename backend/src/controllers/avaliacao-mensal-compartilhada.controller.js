"use strict";

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md: revisão do
// personal que habilita o PDF da avaliação mensal. Aninhado na avaliação
// mensal (que é aninhada no aluno).
const service = require("../services/avaliacao-mensal-compartilhada.service");
const { success } = require("../shared/utils/api-response");

async function obter(req, res) {
  const resultado = await service.obter(req.equipeId, req.params.id, req.params.anoMes);
  success(res, resultado);
}

async function salvar(req, res) {
  const resultado = await service.salvar(
    req.equipeId,
    req.params.id,
    req.params.anoMes,
    req.usuarioId,
    req.body || {}
  );
  success(res, resultado);
}

async function excluir(req, res) {
  await service.excluir(req.equipeId, req.params.id, req.params.anoMes);
  success(res, { avaliacao_mensal: req.params.anoMes });
}

module.exports = { obter, salvar, excluir };
