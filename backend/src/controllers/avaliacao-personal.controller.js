"use strict";

const avaliacaoPersonalService = require("../services/avaliacao-personal.service");
const { success } = require("../shared/utils/api-response");

async function listar(req, res) {
  const avaliacoes = await avaliacaoPersonalService.listar(req.equipeId, req.params.id);
  success(res, avaliacoes);
}

async function criar(req, res) {
  const avaliacao = await avaliacaoPersonalService.criar(req.equipeId, req.params.id, req.usuarioId, req.body || {});
  success(res, avaliacao, { statusCode: 201 });
}

async function atualizar(req, res) {
  const avaliacao = await avaliacaoPersonalService.atualizar(
    req.equipeId,
    req.params.id,
    req.params.avaliacaoId,
    req.body || {}
  );
  success(res, avaliacao);
}

async function excluir(req, res) {
  await avaliacaoPersonalService.excluir(req.equipeId, req.params.id, req.params.avaliacaoId);
  success(res, { id: req.params.avaliacaoId });
}

module.exports = { listar, criar, atualizar, excluir };
