"use strict";

const fichaTreinoRepository = require("../repositories/fichaTreino.repository");
const exercicioRepository = require("../repositories/exercicio.repository");
const alunoRepository = require("../repositories/aluno.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");

async function verificarAluno(equipeId, alunoId) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }
  return aluno;
}

async function listarPorAluno(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  return fichaTreinoRepository.listarPorAluno({ alunoId, equipeId });
}

async function obterAtiva(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  return fichaTreinoRepository.obterAtivaPorAluno({ alunoId, equipeId });
}

async function obterDetalhe(equipeId, fichaId) {
  const ficha = await fichaTreinoRepository.obterPorIdEquipe({ id: fichaId, equipeId });
  if (!ficha) {
    throw new NotFoundError("Ficha de treino não encontrada.");
  }
  return ficha;
}

// Toda atualização relevante cria uma nova versão da ficha - a anterior é
// preservada como histórico, nunca sobrescrita (docs/adr/0013).
async function criarNovaVersao(equipeId, usuarioId, alunoId, { nome, observacoes, itens }) {
  await verificarAluno(equipeId, alunoId);

  if (!Array.isArray(itens) || itens.length === 0) {
    throw new ValidationError('"itens" precisa ser uma lista com pelo menos um exercício.');
  }

  const exerciciosIds = itens.map((item) => item.exercicioId);
  if (exerciciosIds.some((id) => !id)) {
    throw new ValidationError('Cada item precisa informar "exercicioId".');
  }

  const exerciciosSelecionaveis = await exercicioRepository.findSelecionaveisPorIds(exerciciosIds, equipeId);
  const idsEncontrados = new Set(exerciciosSelecionaveis.map((exercicio) => exercicio.id));
  const idsInvalidos = exerciciosIds.filter((id) => !idsEncontrados.has(id));
  if (idsInvalidos.length > 0) {
    throw new ValidationError(
      "Um ou mais exercícios selecionados não existem, estão inativos, ou não pertencem à sua equipe.",
      { exerciciosIds: idsInvalidos }
    );
  }

  const itensNormalizados = itens.map((item) => ({
    exercicioId: item.exercicioId,
    series: item.series !== undefined && item.series !== null && item.series !== "" ? Number(item.series) : null,
    repeticoes: item.repeticoes || null,
    cargaObs: item.cargaObs || null
  }));

  const ficha = await fichaTreinoRepository.criarNovaVersao({
    alunoId,
    equipeId,
    criadoPor: usuarioId,
    nome,
    observacoes,
    itens: itensNormalizados
  });

  return obterDetalhe(equipeId, ficha.id);
}

module.exports = { listarPorAluno, obterAtiva, obterDetalhe, criarNovaVersao };
