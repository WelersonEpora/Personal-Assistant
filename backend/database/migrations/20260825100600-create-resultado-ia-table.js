"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("resultado_ia", {
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
      payload_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      provedor: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "gemini" },
      modelo: { type: Sequelize.STRING(60), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "pendente" },
      erro: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE resultado_ia ADD CONSTRAINT ck_resultado_ia_status CHECK (status IN ('pendente', 'concluido', 'falha'));
    `);

    // Um resultado ativo por Registro no MVP (docs/adr/0007) - reprocessar
    // atualiza a linha existente, nunca insere uma segunda.
    await queryInterface.addConstraint("resultado_ia", {
      fields: ["registro_id"],
      type: "unique",
      name: "uq_resultado_ia_registro_id"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("resultado_ia");
  }
};
