"use strict";

const { Aluno } = require("../models");

// Todo acesso a Aluno passa por equipe_id - alunos são compartilhados entre
// os membros de uma equipe (docs/adr/0011-conceito-de-equipe-e-membro.md).
function findAllByEquipe(equipeId) {
  return Aluno.findAll({ where: { equipe_id: equipeId }, order: [["nome", "ASC"]] });
}

function findByIdAndEquipe(id, equipeId) {
  return Aluno.findOne({ where: { id, equipe_id: equipeId } });
}

function create({ equipeId, nome, observacoes }) {
  return Aluno.create({ equipe_id: equipeId, nome, observacoes: observacoes || null });
}

async function update(aluno, dados) {
  return aluno.update(dados);
}

module.exports = { findAllByEquipe, findByIdAndEquipe, create, update };
