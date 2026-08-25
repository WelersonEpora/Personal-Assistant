"use strict";

const alunoRepository = require("../repositories/aluno.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");

async function listAlunos(usuarioId) {
  return alunoRepository.findAllByUsuario(usuarioId);
}

async function getAluno(usuarioId, id) {
  const aluno = await alunoRepository.findByIdAndUsuario(id, usuarioId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }
  return aluno;
}

async function createAluno(usuarioId, { nome, observacoes }) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  return alunoRepository.create({ usuarioId, nome: nome.trim(), observacoes });
}

async function updateAluno(usuarioId, id, dados) {
  const aluno = await getAluno(usuarioId, id);

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
