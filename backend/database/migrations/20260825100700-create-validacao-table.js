"use strict";

// Única tabela que representa dado OFICIAL confirmado pelo personal
// (docs/adr/0007-separacao-ia-persistencia.md). Só é escrita pelo endpoint
// de confirmação - nunca por um job ou pelo pipeline de IA.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("validacao", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      registro_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "registro", key: "id" },
        onDelete: "CASCADE"
      },
      resultado_ia_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "resultado_ia", key: "id" },
        onDelete: "RESTRICT"
      },
      usuario_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "RESTRICT"
      },
      payload_confirmado_json: { type: Sequelize.JSONB, allowNull: false },
      confirmado_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addConstraint("validacao", {
      fields: ["registro_id"],
      type: "unique",
      name: "uq_validacao_registro_id"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("validacao");
  }
};
