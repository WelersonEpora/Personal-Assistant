"use strict";

// docs/adr/0002-conceito-de-registro.md: o id do Registro nasce no CLIENTE
// (celular) - por isso, ao contrario das outras tabelas, "id" aqui NAO tem
// defaultValue gen_random_uuid(): quem insere sempre traz o id pronto.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("registro", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true
      },
      usuario_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "CASCADE"
      },
      aluno_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "aluno", key: "id" },
        onDelete: "CASCADE"
      },
      titulo: { type: Sequelize.STRING(160), allowNull: true },
      iniciado_em: { type: Sequelize.DATE, allowNull: false },
      finalizado_em: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "recebido" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE registro ADD CONSTRAINT ck_registro_status CHECK (status IN (
        'recebido', 'transcrevendo', 'interpretando', 'aguardando_revisao',
        'confirmado', 'erro_transcricao', 'erro_interpretacao'
      ));
    `);

    await queryInterface.addIndex("registro", ["usuario_id", "status"], { name: "idx_registro_usuario_status" });
    await queryInterface.addIndex("registro", ["aluno_id"], { name: "idx_registro_aluno_id" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("registro");
  }
};
