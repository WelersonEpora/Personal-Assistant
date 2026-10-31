"use strict";

const fichaTreinoService = require("../services/fichaTreino.service");
const { success } = require("../shared/utils/api-response");

async function listarPorAluno(req, res) {
  const fichas = await fichaTreinoService.listarPorAluno(req.equipeId, req.params.id);
  success(res, fichas);
}

async function listarAtivas(req, res) {
  const fichas = await fichaTreinoService.listarAtivas(req.equipeId, req.params.id);
  success(res, fichas);
}

async function criar(req, res) {
  const ficha = await fichaTreinoService.criarNovaVersao(req.equipeId, req.usuarioId, req.params.id, req.body || {});
  success(res, ficha, { statusCode: 201 });
}

async function obterDetalhe(req, res) {
  const ficha = await fichaTreinoService.obterDetalhe(req.equipeId, req.params.id);
  success(res, ficha);
}

async function arquivar(req, res) {
  const ficha = await fichaTreinoService.arquivar(req.equipeId, req.params.id);
  success(res, ficha);
}

module.exports = { listarPorAluno, listarAtivas, criar, obterDetalhe, arquivar };
