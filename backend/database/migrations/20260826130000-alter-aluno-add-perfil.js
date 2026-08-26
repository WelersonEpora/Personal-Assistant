"use strict";

// Campos de perfil do aluno: telefone de contato, foto (avatar) e soft-delete
// (deletado_em, mesmo critério do registro - NULL = não excluído). Exclusão
// de aluno leva consigo os relatos/avaliações (ver aluno.service.js::excluir),
// por isso não há necessidade de FK ON DELETE aqui.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("aluno", "telefone", { type: Sequelize.STRING(20), allowNull: true });
    await queryInterface.addColumn("aluno", "foto_caminho", { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addColumn("aluno", "deletado_em", { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("aluno", "telefone");
    await queryInterface.removeColumn("aluno", "foto_caminho");
    await queryInterface.removeColumn("aluno", "deletado_em");
  }
};
