"use strict";

const { sequelize, Aluno, Registro } = require("../models");

// Todo acesso a Aluno passa por equipe_id - alunos são compartilhados entre
// os membros de uma equipe (docs/adr/0011-conceito-de-equipe-e-membro.md).
// Ordenação: ativos antes de inativos e, dentro de cada grupo, favoritos
// antes dos demais - nome alfabético como critério final em ambos os casos.
function findAllByEquipe(equipeId) {
  return Aluno.findAll({
    where: { equipe_id: equipeId, deletado_em: null },
    order: [
      ["ativo", "DESC"],
      ["favorito", "DESC"],
      ["nome", "ASC"]
    ]
  });
}

function findByIdAndEquipe(id, equipeId) {
  return Aluno.findOne({ where: { id, equipe_id: equipeId, deletado_em: null } });
}

function create({ equipeId, nome, observacoes, telefone }) {
  return Aluno.create({ equipe_id: equipeId, nome, observacoes: observacoes || null, telefone: telefone || null });
}

async function update(aluno, dados) {
  return aluno.update(dados);
}

// Soft-delete em cascata: excluir o aluno leva consigo todos os Registros
// (e, por tabela, as Validações confirmadas que dependem deles) - uma única
// transação, já que a exclusão do aluno só faz sentido se os dois passos
// forem atômicos.
async function marcarComoExcluidoComRegistros({ id, equipeId }) {
  await sequelize.transaction(async (transaction) => {
    await Aluno.update({ deletado_em: new Date() }, { where: { id, equipe_id: equipeId, deletado_em: null }, transaction });
    await Registro.update({ deletado_em: new Date() }, { where: { aluno_id: id, equipe_id: equipeId, deletado_em: null }, transaction });
  });
}

module.exports = { findAllByEquipe, findByIdAndEquipe, create, update, marcarComoExcluidoComRegistros };
