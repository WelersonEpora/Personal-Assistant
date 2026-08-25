"use strict";

// docs/adr/0011-conceito-de-equipe-e-membro.md: equipe é o tenant - dado
// deliberadamente minimo (só nome), mesma filosofia da ADR-0008.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("equipe", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      nome: { type: Sequelize.STRING(120), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("equipe");
  }
};
