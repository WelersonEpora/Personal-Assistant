"use strict";

// Estrela de favorito (docs/adr/0008: cadastro mínimo, campo de controle de
// UI - não é dado de domínio). Usado só para priorizar a posição do aluno
// nas listagens (ver aluno.repository.js::findAllByEquipe).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("aluno", "favorito", { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("aluno", "favorito");
  }
};
