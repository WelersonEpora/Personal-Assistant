"use strict";

// docs/adr/0029: tabela da avaliação física do mês que vai no PDF do aluno,
// calculada pelo código na geração do Acompanhamento (os mesmos números que a
// IA leu). Aditiva, sem backfill: mês já gerado só ganha a seção ao Regerar.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("avaliacao_mensal", "avaliacao_fisica_resumo_json", {
      type: Sequelize.JSONB,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("avaliacao_mensal", "avaliacao_fisica_resumo_json");
  }
};
