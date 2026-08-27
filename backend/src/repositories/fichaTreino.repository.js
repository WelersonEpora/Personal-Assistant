"use strict";

const { sequelize, FichaTreino, FichaTreinoExercicio, Exercicio, Usuario } = require("../models");

const INCLUDE_ITENS = {
  model: FichaTreinoExercicio,
  as: "itens",
  include: [{ model: Exercicio, as: "exercicio" }],
  separate: true,
  order: [["ordem", "ASC"]]
};
const INCLUDE_CRIADO_POR = { model: Usuario, as: "criadoPor", attributes: ["id", "nome"] };

function listarPorAluno({ alunoId, equipeId }) {
  return FichaTreino.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId },
    include: [INCLUDE_ITENS, INCLUDE_CRIADO_POR],
    order: [["created_at", "DESC"]]
  });
}

function obterAtivaPorAluno({ alunoId, equipeId }) {
  return FichaTreino.findOne({
    where: { aluno_id: alunoId, equipe_id: equipeId, ativo: true },
    include: [INCLUDE_ITENS, INCLUDE_CRIADO_POR]
  });
}

function obterPorIdEquipe({ id, equipeId }) {
  return FichaTreino.findOne({
    where: { id, equipe_id: equipeId },
    include: [INCLUDE_ITENS, INCLUDE_CRIADO_POR]
  });
}

// Preserva o histórico sem versionamento explícito (docs/adr/0013): a
// ficha ativa anterior só é marcada ativo=false, nunca editada ou
// apagada; a nova nasce como uma linha própria, com seus próprios itens.
async function criarNovaVersao({ alunoId, equipeId, criadoPor, nome, observacoes, itens }) {
  return sequelize.transaction(async (transaction) => {
    await FichaTreino.update(
      { ativo: false },
      { where: { aluno_id: alunoId, equipe_id: equipeId, ativo: true }, transaction }
    );

    const ficha = await FichaTreino.create(
      { aluno_id: alunoId, equipe_id: equipeId, criado_por: criadoPor, nome: nome || null, observacoes: observacoes || null, ativo: true },
      { transaction }
    );

    await FichaTreinoExercicio.bulkCreate(
      itens.map((item, indice) => ({
        ficha_treino_id: ficha.id,
        exercicio_id: item.exercicioId,
        ordem: indice + 1,
        series: item.series ?? null,
        repeticoes: item.repeticoes || null,
        carga_obs: item.cargaObs || null
      })),
      { transaction }
    );

    return ficha;
  });
}

module.exports = { listarPorAluno, obterAtivaPorAluno, obterPorIdEquipe, criarNovaVersao };
