"use strict";

// Soft-delete de Registro (relato incluído por engano) - o personal só pode
// excluir ANTES de confirmar (docs/adr/0007: depois de confirmado, o
// Registro já virou Validacao, dado oficial do histórico do aluno, e não
// pode ser removido por essa via). NULL = não excluído.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("registro", "deletado_em", { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("registro", "deletado_em");
  }
};
