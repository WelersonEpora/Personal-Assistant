"use strict";

// Foto (avatar) do personal - mesmo padrão de aluno.foto_caminho (ver
// migration 20260826130000-alter-aluno-add-perfil.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("usuario", "foto_caminho", { type: Sequelize.STRING(255), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("usuario", "foto_caminho");
  }
};
