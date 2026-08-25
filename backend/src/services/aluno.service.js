"use strict";

const alunoRepository = require("../repositories/aluno.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");

async function listAlunos(equipeId) {
  return alunoRepository.findAllByEquipe(equipeId);
}

async function getAluno(equipeId, id) {
  const aluno = await alunoRepository.findByIdAndEquipe(id, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }
  return aluno;
}

async function createAluno(equipeId, { nome, observacoes }) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  return alunoRepository.create({ equipeId, nome: nome.trim(), observacoes });
}

async function updateAluno(equipeId, id, dados) {
  const aluno = await getAluno(equipeId, id);

  const atualizacao = {};
  if (dados.nome !== undefined) {
    if (!dados.nome || !dados.nome.trim()) {
      throw new ValidationError('"nome" não pode ficar vazio.');
    }
    atualizacao.nome = dados.nome.trim();
  }
  if (dados.observacoes !== undefined) atualizacao.observacoes = dados.observacoes;
  if (dados.ativo !== undefined) atualizacao.ativo = Boolean(dados.ativo);

  return alunoRepository.update(aluno, atualizacao);
}

module.exports = { listAlunos, getAluno, createAluno, updateAluno };
