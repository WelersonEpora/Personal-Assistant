"use strict";

const { Op } = require("sequelize");
const { AvaliacaoPersonal, Usuario } = require("../models");

const INCLUDE_AUTOR = { model: Usuario, as: "autor", attributes: ["id", "nome"] };

function listarPorAluno({ alunoId, equipeId }) {
  return AvaliacaoPersonal.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId },
    include: [INCLUDE_AUTOR],
    order: [["created_at", "DESC"]]
  });
}

function obterPorId({ id, equipeId }) {
  return AvaliacaoPersonal.findOne({ where: { id, equipe_id: equipeId }, include: [INCLUDE_AUTOR] });
}

function criar({ alunoId, equipeId, autorId, texto }) {
  return AvaliacaoPersonal.create({ aluno_id: alunoId, equipe_id: equipeId, autor_id: autorId, texto });
}

function atualizar(avaliacao, { texto }) {
  return avaliacao.update({ texto });
}

function excluir(avaliacao) {
  return avaliacao.destroy();
}

// Avaliações do personal escritas dentro da janela [inicio, fim) - mesmo
// bucketing por período usado no ciclo mensal (docs/adr/0015).
function listarNoPeriodo({ equipeId, alunoId, inicio, fim }) {
  return AvaliacaoPersonal.findAll({
    where: { equipe_id: equipeId, aluno_id: alunoId, created_at: { [Op.gte]: inicio, [Op.lt]: fim } },
    order: [["created_at", "ASC"]]
  });
}

// Avaliações do personal escritas após `desde` - usado pela análise sob
// demanda (as ainda não incorporadas a um fechamento mensal).
function listarDesde({ equipeId, alunoId, desde }) {
  return AvaliacaoPersonal.findAll({
    where: { equipe_id: equipeId, aluno_id: alunoId, created_at: { [Op.gt]: desde } },
    order: [["created_at", "ASC"]]
  });
}

module.exports = {
  listarPorAluno,
  obterPorId,
  criar,
  atualizar,
  excluir,
  listarNoPeriodo,
  listarDesde
};
