"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("arquivo_audio", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      registro_entrada_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "registro_entrada", key: "id" },
        onDelete: "CASCADE"
      },
      caminho_armazenamento: { type: Sequelize.STRING(300), allowNull: false },
      mime_type: { type: Sequelize.STRING(100), allowNull: false },
      tamanho_bytes: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addConstraint("arquivo_audio", {
      fields: ["registro_entrada_id"],
      type: "unique",
      name: "uq_arquivo_audio_registro_entrada_id"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("arquivo_audio");
  }
};
