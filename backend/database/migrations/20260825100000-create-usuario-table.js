"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("usuario", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      nome: { type: Sequelize.STRING(120), allowNull: false },
      email: { type: Sequelize.STRING(160), allowNull: false },
      senha_hash: { type: Sequelize.STRING(200), allowNull: false },
      especialidade: { type: Sequelize.STRING(160), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addConstraint("usuario", {
      fields: ["email"],
      type: "unique",
      name: "uq_usuario_email"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("usuario");
  }
};
