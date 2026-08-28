"use strict";

const { METRICAS, linhasSeed } = require("../../src/services/avaliacao-fisica/catalogo-metricas");

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §3.2):
// catálogo núcleo das métricas de avaliação física. Tabela de referência -
// bem-vinda em produção (não é dado de dev). Idempotente: a PK é o próprio
// `codigo`, então basta inserir os que ainda não existem. A lista fica em
// src/services/avaliacao-fisica/catalogo-metricas.js (fonte única - o
// importador do legado usa a mesma).
module.exports = {
  async up(queryInterface) {
    const todas = linhasSeed(new Date());

    const existentes = await queryInterface.sequelize.query(
      "SELECT codigo FROM metrica_avaliacao_fisica WHERE codigo IN (:codigos)",
      { replacements: { codigos: todas.map((l) => l.codigo) }, type: "SELECT" }
    );
    const jaExiste = new Set(existentes.map((l) => l.codigo));
    const novas = todas.filter((l) => !jaExiste.has(l.codigo));

    if (novas.length > 0) {
      await queryInterface.bulkInsert("metrica_avaliacao_fisica", novas);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("metrica_avaliacao_fisica", {
      codigo: METRICAS.map(([codigo]) => codigo)
    });
  }
};
