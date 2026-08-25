"use strict";

const alunoService = require("../services/aluno.service");
const { success } = require("../shared/utils/api-response");

async function list(req, res) {
  const alunos = await alunoService.listAlunos(req.usuarioId);
  success(res, alunos);
}

async function getById(req, res) {
  const aluno = await alunoService.getAluno(req.usuarioId, req.params.id);
  success(res, aluno);
}

async function create(req, res) {
  const aluno = await alunoService.createAluno(req.usuarioId, req.body || {});
  success(res, aluno, { statusCode: 201 });
}

async function update(req, res) {
  const aluno = await alunoService.updateAluno(req.usuarioId, req.params.id, req.body || {});
  success(res, aluno);
}

module.exports = { list, getById, create, update };
