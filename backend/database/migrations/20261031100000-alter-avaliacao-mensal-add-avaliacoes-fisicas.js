"use strict";

// docs/adr/0025: rastreio de quais avaliações físicas (as do mês, não a base
// de comparação) entraram em cada Acompanhamento Mensal - irmã de
// `avaliacoes_personal_consideradas`. Aditiva, sem backfill: os ciclos antigos
// ficam com [] (é a verdade - a avaliação física não entrava).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("avaliacao_mensal", "avaliacoes_fisicas_consideradas", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: []
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("avaliacao_mensal", "avaliacoes_fisicas_consideradas");
  }
};
