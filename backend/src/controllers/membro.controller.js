"use strict";

const membroService = require("../services/membro.service");
const { success } = require("../shared/utils/api-response");

async function list(req, res) {
  const membros = await membroService.listarMembros(req.equipeId);
  success(res, membros);
}

async function create(req, res) {
  const membro = await membroService.criarMembro(req.equipeId, req.body || {});
  success(res, membro, { statusCode: 201 });
}

async function update(req, res) {
  const membro = await membroService.atualizarMembro(req.equipeId, req.params.id, req.body || {});
  success(res, membro);
}

module.exports = { list, create, update };
