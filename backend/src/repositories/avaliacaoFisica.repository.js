"use strict";

const { sequelize, AvaliacaoFisica, AvaliacaoFisicaMedida, MetricaAvaliacaoFisica } = require("../models");

// docs/adr/0016: CRUD direto do personal, escopado por equipe. Não é dado
// oficial (≠ `validacao`) e não passa pelo pipeline de IA.

const INCLUDE_MEDIDAS = {
  model: AvaliacaoFisicaMedida,
  as: "medidas",
  include: [{ model: MetricaAvaliacaoFisica, as: "metrica" }]
};

// Ordenação estável de medidas: pela ordem do catálogo, principal antes,
// método alfabético como desempate.
const ORDER_MEDIDAS = [
  [{ model: AvaliacaoFisicaMedida, as: "medidas" }, { model: MetricaAvaliacaoFisica, as: "metrica" }, "ordem", "ASC"],
  [{ model: AvaliacaoFisicaMedida, as: "medidas" }, "principal", "DESC"],
  [{ model: AvaliacaoFisicaMedida, as: "medidas" }, "metodo", "ASC"]
];

function listarPorAluno({ alunoId, equipeId }) {
  return AvaliacaoFisica.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId },
    include: [INCLUDE_MEDIDAS],
    order: [
      ["data", "DESC"],
      ["created_at", "DESC"],
      ...ORDER_MEDIDAS
    ]
  });
}

function obterPorId({ id, equipeId }) {
  return AvaliacaoFisica.findOne({
    where: { id, equipe_id: equipeId },
    include: [INCLUDE_MEDIDAS],
    order: ORDER_MEDIDAS
  });
}

// Cria a avaliação + suas medidas numa transação. `medidas` já validadas/
// normalizadas pelo service.
async function criar({ header, medidas }) {
  return sequelize.transaction(async (transaction) => {
    const avaliacao = await AvaliacaoFisica.create(header, { transaction });
    if (medidas.length > 0) {
      await AvaliacaoFisicaMedida.bulkCreate(
        medidas.map((m) => ({ ...m, avaliacao_fisica_id: avaliacao.id })),
        { transaction, validate: true }
      );
    }
    return avaliacao.id;
  });
}

// Atualiza o header e, se `medidas` != null, substitui todo o conjunto de
// medidas (PUT substitui). Uma transação.
async function atualizar(avaliacao, { header, medidas }) {
  await sequelize.transaction(async (transaction) => {
    if (Object.keys(header).length > 0) {
      await avaliacao.update(header, { transaction });
    }
    if (medidas !== null) {
      await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avaliacao.id }, transaction });
      if (medidas.length > 0) {
        await AvaliacaoFisicaMedida.bulkCreate(
          medidas.map((m) => ({ ...m, avaliacao_fisica_id: avaliacao.id })),
          { transaction, validate: true }
        );
      }
    }
  });
  return avaliacao.id;
}

function excluir(avaliacao) {
  // ON DELETE CASCADE remove as medidas.
  return avaliacao.destroy();
}

function listarCatalogo() {
  return MetricaAvaliacaoFisica.findAll({ order: [["ordem", "ASC"]] });
}

module.exports = { listarPorAluno, obterPorId, criar, atualizar, excluir, listarCatalogo };
