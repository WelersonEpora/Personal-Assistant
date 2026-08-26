"use strict";

const alunoService = require("../services/aluno.service");
const { success } = require("../shared/utils/api-response");
const { ValidationError } = require("../shared/errors");

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

async function excluir(req, res) {
  await alunoService.excluirAluno(req.equipeId, req.params.id);
  success(res, { id: req.params.id });
}

async function enviarFoto(req, res) {
  if (!req.file) {
    throw new ValidationError('Envie a foto no campo "foto".');
  }
  const aluno = await alunoService.atualizarFoto(req.equipeId, req.params.id, { buffer: req.file.buffer, mimeType: req.file.mimetype });
  success(res, aluno);
}

async function streamFoto(req, res) {
  const { buffer, mimeType } = await alunoService.obterFoto(req.equipeId, req.params.id);
  res.set("Content-Type", mimeType);
  res.send(buffer);
}

module.exports = { list, getById, create, update, excluir, enviarFoto, streamFoto };
