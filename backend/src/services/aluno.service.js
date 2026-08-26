"use strict";

const alunoRepository = require("../repositories/aluno.repository");
const storageFoto = require("./storage-foto.service");
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

async function createAluno(equipeId, { nome, observacoes, telefone }) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  return alunoRepository.create({ equipeId, nome: nome.trim(), observacoes, telefone });
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
  if (dados.telefone !== undefined) atualizacao.telefone = dados.telefone ? dados.telefone.trim() : null;
  if (dados.ativo !== undefined) atualizacao.ativo = Boolean(dados.ativo);
  if (dados.favorito !== undefined) atualizacao.favorito = Boolean(dados.favorito);

  return alunoRepository.update(aluno, atualizacao);
}

// Soft-delete (docs/adr/0007, mesmo critério do Registro): leva consigo
// todos os Registros do aluno (e as Validações que dependem deles), numa
// única transação (aluno.repository.js::marcarComoExcluidoComRegistros).
async function excluirAluno(equipeId, id) {
  await getAluno(equipeId, id);
  await alunoRepository.marcarComoExcluidoComRegistros({ id, equipeId });
}

async function atualizarFoto(equipeId, id, { buffer, mimeType }) {
  const aluno = await getAluno(equipeId, id);
  if (!storageFoto.mimeSuportado(mimeType)) {
    throw new ValidationError("Formato de imagem não suportado - use JPEG, PNG ou WebP.");
  }
  const fotoCaminho = await storageFoto.salvar({ chave: `aluno-${id}`, buffer, mimeType });
  return alunoRepository.update(aluno, { foto_caminho: fotoCaminho });
}

async function obterFoto(equipeId, id) {
  const aluno = await getAluno(equipeId, id);
  if (!aluno.foto_caminho) {
    throw new NotFoundError("Aluno não tem foto cadastrada.");
  }
  return storageFoto.ler(aluno.foto_caminho);
}

module.exports = { listAlunos, getAluno, createAluno, updateAluno, excluirAluno, atualizarFoto, obterFoto };
