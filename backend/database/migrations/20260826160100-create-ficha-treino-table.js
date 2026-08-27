"use strict";

// docs/adr/0013-catalogo-exercicios-ficha-treino.md: cada atualização
// relevante da ficha cria uma NOVA linha (a anterior nunca é editada, só
// marcada ativo=false) - histórico preservado sem sistema de versionamento
// numerado. O índice único parcial garante, no próprio banco, que só uma
// ficha por aluno esteja ativa a qualquer momento.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ficha_treino", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      aluno_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "aluno", key: "id" },
        onDelete: "CASCADE"
      },
      equipe_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "equipe", key: "id" },
        onDelete: "CASCADE"
      },
      criado_por: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "CASCADE"
      },
      nome: { type: Sequelize.STRING(160), allowNull: true },
      observacoes: { type: Sequelize.TEXT, allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addIndex("ficha_treino", ["aluno_id", "created_at"], { name: "idx_ficha_treino_aluno_created" });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_ficha_treino_aluno_ativo ON ficha_treino (aluno_id) WHERE ativo = true;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ficha_treino");
  }
};
