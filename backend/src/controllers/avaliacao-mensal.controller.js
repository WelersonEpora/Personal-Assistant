"use strict";

const avaliacaoMensalService = require("../services/avaliacao-mensal.service");
const avaliacaoMensalRepository = require("../repositories/avaliacaoMensal.repository");
const alunoService = require("../services/aluno.service");
const { success } = require("../shared/utils/api-response");
const { NotFoundError } = require("../shared/errors");

async function listarPorAluno(req, res) {
  await alunoService.getAluno(req.equipeId, req.params.id);
  const avaliacoes = await avaliacaoMensalRepository.listarPorAluno({
    alunoId: req.params.id,
    equipeId: req.equipeId
  });
  success(res, avaliacoes);
}

async function obterPorMes(req, res) {
  await alunoService.getAluno(req.equipeId, req.params.id);
  const avaliacao = await avaliacaoMensalRepository.obterPorMes({
    alunoId: req.params.id,
    equipeId: req.equipeId,
    anoMes: req.params.anoMes
  });
  if (!avaliacao) {
    throw new NotFoundError("Nenhuma avaliação mensal para este aluno neste mês.");
  }
  success(res, avaliacao);
}

// Geração/regeneração manual pelo personal (docs/adr/0015). Sem etapa de
// validação - a avaliação nunca vira dado oficial.
async function gerar(req, res) {
  const resultado = await avaliacaoMensalService.gerarParaAluno({
    equipeId: req.equipeId,
    alunoId: req.params.id,
    anoMes: req.params.anoMes,
    origem: "manual"
  });
  // Dados insuficientes numa geração manual não vira registro (docs/adr/0015):
  // resposta não persistida, 200 em vez de 201.
  const statusCode = resultado.persistida === false ? 200 : 201;
  success(res, resultado, { statusCode });
}

module.exports = { listarPorAluno, obterPorMes, gerar };
