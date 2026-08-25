"use strict";

// Suporta ativar/desativar um membro pela interface administrativa (sem
// ADR novo - operacional, segue o mesmo padrão de aluno.ativo). Desativar
// um membro desliga o acesso dele à equipe (auth.service.js passa a
// rejeitar login), sem apagar usuario nem decidir papel.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("membro", "ativo", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("membro", "ativo");
  }
};
