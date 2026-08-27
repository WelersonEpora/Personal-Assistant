"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md: avaliação escrita pelo
// próprio personal (texto livre, sem IA). CRUD simples escopado por equipe.
// Não é dado oficial nem saída de IA - editar depois que já entrou num ciclo
// de IA não reescreve aquele ciclo (os ciclos são snapshots).
const avaliacaoPersonalRepository = require("../repositories/avaliacaoPersonal.repository");
const alunoRepository = require("../repositories/aluno.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");

const TAMANHO_MAXIMO = 5000;

function normalizarTexto(texto) {
  const limpo = typeof texto === "string" ? texto.trim() : "";
  if (!limpo) {
    throw new ValidationError('"texto" é obrigatório.');
  }
  if (limpo.length > TAMANHO_MAXIMO) {
    throw new ValidationError(`"texto" não pode passar de ${TAMANHO_MAXIMO} caracteres.`);
  }
  return limpo;
}

async function verificarAluno(equipeId, alunoId) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }
  return aluno;
}

async function listar(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  return avaliacaoPersonalRepository.listarPorAluno({ alunoId, equipeId });
}

async function criar(equipeId, alunoId, autorId, { texto }) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await avaliacaoPersonalRepository.criar({
    alunoId,
    equipeId,
    autorId,
    texto: normalizarTexto(texto)
  });
  return avaliacaoPersonalRepository.obterPorId({ id: avaliacao.id, equipeId });
}

async function atualizar(equipeId, alunoId, avaliacaoId, { texto }) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await avaliacaoPersonalRepository.obterPorId({ id: avaliacaoId, equipeId });
  if (!avaliacao || avaliacao.aluno_id !== alunoId) {
    throw new NotFoundError("Avaliação não encontrada.");
  }
  await avaliacaoPersonalRepository.atualizar(avaliacao, { texto: normalizarTexto(texto) });
  return avaliacaoPersonalRepository.obterPorId({ id: avaliacaoId, equipeId });
}

async function excluir(equipeId, alunoId, avaliacaoId) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await avaliacaoPersonalRepository.obterPorId({ id: avaliacaoId, equipeId });
  if (!avaliacao || avaliacao.aluno_id !== alunoId) {
    throw new NotFoundError("Avaliação não encontrada.");
  }
  await avaliacaoPersonalRepository.excluir(avaliacao);
}

module.exports = { listar, criar, atualizar, excluir };
