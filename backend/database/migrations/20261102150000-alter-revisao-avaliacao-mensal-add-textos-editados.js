"use strict";

// Ajustes de texto do personal no PDF do Acompanhamento Mensal (adendo
// 2026-11-02 da docs/adr/0023): chave do trecho -> texto que vai ao aluno. A
// `avaliacao_mensal.avaliacao_json` (saída da IA) não muda. Regerar a avaliação
// descarta os ajustes (a revisão fica desatualizada e a tela parte do texto novo).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("revisao_avaliacao_mensal", "textos_editados", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {}
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("revisao_avaliacao_mensal", "textos_editados");
  }
};
