"use strict";

const alunoService = require("../services/aluno.service");
const { success } = require("../shared/utils/api-response");

async function list(req, res) {
  const alunos = await alunoService.listAlunos(req.equipeId);
  success(res, alunos);
}

async function getById(req, res) {
  const aluno = await alunoService.getAluno(req.equipeId, req.params.id);
  success(res, aluno);
}

async function create(req, res) {
  const aluno = await alunoService.createAluno(req.equipeId, req.body || {});
  success(res, aluno, { statusCode: 201 });
}

async function update(req, res) {
  const aluno = await alunoService.updateAluno(req.equipeId, req.params.id, req.body || {});
  success(res, aluno);
}

module.exports = { list, getById, create, update };
