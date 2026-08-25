"use strict";

const equipeRepository = require("../repositories/equipe.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");

async function obterEquipe(equipeId) {
  const equipe = await equipeRepository.findById(equipeId);
  if (!equipe) {
    throw new NotFoundError("Equipe não encontrada.");
  }
  const totalMembros = await equipeRepository.countMembros(equipeId);
  return { id: equipe.id, nome: equipe.nome, totalMembros };
}

async function atualizarNome(equipeId, nome) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  const equipe = await equipeRepository.findById(equipeId);
  if (!equipe) {
    throw new NotFoundError("Equipe não encontrada.");
  }
  await equipeRepository.update(equipe, { nome: nome.trim() });
  return obterEquipe(equipeId);
}

module.exports = { obterEquipe, atualizarNome };
