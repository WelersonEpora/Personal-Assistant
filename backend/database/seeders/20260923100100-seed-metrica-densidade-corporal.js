"use strict";

// docs/adr/0024-calculo-percentual-gordura-por-protocolo.md: acrescenta
// `densidade_corporal` ao catálogo em bancos já seedados (o seeder do catálogo
// núcleo já rodou e não roda de novo). Reaproveita o mesmo `up` idempotente -
// insere só os códigos de catalogo-metricas.js que ainda não existem.
const catalogoNucleo = require("./20260828110000-seed-metricas-avaliacao-fisica");

module.exports = {
  async up(queryInterface) {
    await catalogoNucleo.up(queryInterface);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("metrica_avaliacao_fisica", { codigo: "densidade_corporal" });
  }
};
