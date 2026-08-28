"use strict";

const avaliacaoFisicaService = require("../services/avaliacao-fisica.service");
const { success } = require("../shared/utils/api-response");

async function listarMetricas(_req, res) {
  const metricas = await avaliacaoFisicaService.listarMetricas();
  success(res, metricas);
}

async function listar(req, res) {
  const avaliacoes = await avaliacaoFisicaService.listar(req.equipeId, req.params.id);
  success(res, avaliacoes);
}

async function obter(req, res) {
  const avaliacao = await avaliacaoFisicaService.obter(req.equipeId, req.params.id, req.params.avaliacaoId);
  success(res, avaliacao);
}

async function criar(req, res) {
  const avaliacao = await avaliacaoFisicaService.criar(req.equipeId, req.params.id, req.usuarioId, req.body || {});
  success(res, avaliacao, { statusCode: 201 });
}

async function atualizar(req, res) {
  const avaliacao = await avaliacaoFisicaService.atualizar(
    req.equipeId,
    req.params.id,
    req.params.avaliacaoId,
    req.body || {}
  );
  success(res, avaliacao);
}

async function excluir(req, res) {
  await avaliacaoFisicaService.excluir(req.equipeId, req.params.id, req.params.avaliacaoId);
  success(res, { id: req.params.avaliacaoId });
}

module.exports = { listarMetricas, listar, obter, criar, atualizar, excluir };
