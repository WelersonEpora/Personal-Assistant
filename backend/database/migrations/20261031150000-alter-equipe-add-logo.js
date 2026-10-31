"use strict";

// Logo da equipe (docs/adr/0030) - mesmo padrão de usuario.foto_caminho:
// guarda só o nome do arquivo em storage/fotos (services/storage-foto.service.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("equipe", "logo_caminho", { type: Sequelize.STRING(255), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("equipe", "logo_caminho");
  }
};
