"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("aluno", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      usuario_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "CASCADE"
      },
      nome: { type: Sequelize.STRING(120), allowNull: false },
      observacoes: { type: Sequelize.TEXT, allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addIndex("aluno", ["usuario_id"], { name: "idx_aluno_usuario_id" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("aluno");
  }
};
