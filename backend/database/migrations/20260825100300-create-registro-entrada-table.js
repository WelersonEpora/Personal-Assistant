"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("registro_entrada", {
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
      tipo: { type: Sequelize.STRING(10), allowNull: false },
      ordem: { type: Sequelize.INTEGER, allowNull: false },
      conteudo_texto: { type: Sequelize.TEXT, allowNull: true },
      duracao_segundos: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE registro_entrada ADD CONSTRAINT ck_registro_entrada_tipo CHECK (tipo IN ('audio', 'texto'));
    `);

    // Garante, no proprio banco, a idempotencia de sincronizacao descrita
    // em docs/adr/0005: reenviar a mesma entrada (mesmo registro_id + ordem)
    // nunca duplica linha.
    await queryInterface.addConstraint("registro_entrada", {
      fields: ["registro_id", "ordem"],
      type: "unique",
      name: "uq_registro_entrada_registro_ordem"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("registro_entrada");
  }
};
