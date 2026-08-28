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

// docs/adr/0016: data de nascimento e sexo são atributos estáveis da pessoa
// (entram na avaliação física). Opcionais - o cadastro mínimo não os exige.
function validarDataNascimento(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new ValidationError('"data_nascimento" deve estar no formato AAAA-MM-DD.');
  }
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new ValidationError('"data_nascimento" é uma data inválida.');
  }
  return valor;
}

function validarSexo(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;
  if (valor !== "F" && valor !== "M") {
    throw new ValidationError('"sexo" precisa ser "F" ou "M".');
  }
  return valor;
}

async function createAluno(equipeId, { nome, observacoes, telefone, data_nascimento, sexo }) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  return alunoRepository.create({
    equipeId,
    nome: nome.trim(),
    observacoes,
    telefone,
    data_nascimento: validarDataNascimento(data_nascimento) ?? null,
    sexo: validarSexo(sexo) ?? null
  });
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
  if (dados.dispensa_ficha_treino !== undefined) atualizacao.dispensa_ficha_treino = Boolean(dados.dispensa_ficha_treino);
  if (dados.dispensa_avaliacao_fisica !== undefined)
    atualizacao.dispensa_avaliacao_fisica = Boolean(dados.dispensa_avaliacao_fisica);
  if (dados.data_nascimento !== undefined) atualizacao.data_nascimento = validarDataNascimento(dados.data_nascimento);
  if (dados.sexo !== undefined) atualizacao.sexo = validarSexo(dados.sexo);

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

async function removerFoto(equipeId, id) {
  const aluno = await getAluno(equipeId, id);
  if (!aluno.foto_caminho) {
    throw new NotFoundError("Aluno não tem foto cadastrada.");
  }
  await storageFoto.remover(aluno.foto_caminho);
  return alunoRepository.update(aluno, { foto_caminho: null });
}

module.exports = { listAlunos, getAluno, createAluno, updateAluno, excluirAluno, atualizarFoto, obterFoto, removerFoto };
