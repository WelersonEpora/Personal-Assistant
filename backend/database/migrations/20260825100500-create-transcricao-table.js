"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("transcricao", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      arquivo_audio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "arquivo_audio", key: "id" },
        onDelete: "CASCADE"
      },
      texto: { type: Sequelize.TEXT, allowNull: true },
      provedor: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "gemini" },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "pendente" },
      erro: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE transcricao ADD CONSTRAINT ck_transcricao_status CHECK (status IN ('pendente', 'concluida', 'falha'));
    `);

    await queryInterface.addConstraint("transcricao", {
      fields: ["arquivo_audio_id"],
      type: "unique",
      name: "uq_transcricao_arquivo_audio_id"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("transcricao");
  }
};
