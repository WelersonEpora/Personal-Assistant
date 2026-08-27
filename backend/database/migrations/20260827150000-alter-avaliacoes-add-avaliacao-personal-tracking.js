"use strict";

// docs/adr/0015: rastreio de quais avaliações do personal entraram em cada
// ciclo de IA (mensal e análise sob demanda) - mesmo critério de
// `baseada_em_registro_ids`.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("avaliacao_mensal", "avaliacoes_personal_consideradas", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: []
    });
    await queryInterface.addColumn("analise_sob_demanda", "baseada_em_avaliacao_personal_ids", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: []
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("avaliacao_mensal", "avaliacoes_personal_consideradas");
    await queryInterface.removeColumn("analise_sob_demanda", "baseada_em_avaliacao_personal_ids");
  }
};
