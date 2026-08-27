"use strict";

// docs/adr/0014-acesso-aluno-ficha-por-link.md: link temporário e opaco que
// dá ao aluno acesso somente-leitura à sua Ficha de Treino ativa, sem login
// nem exposição de id na URL. O token é o segredo em si (capability URL) -
// alta entropia (256 bits), com expiração e revogação. O índice parcial
// único garante, no banco, no máximo um link não-revogado por aluno
// ("gerar um novo link invalida o anterior").
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ficha_acesso_link", {
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
      token: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expira_em: { type: Sequelize.DATE, allowNull: false },
      revogado_em: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addIndex("ficha_acesso_link", ["aluno_id"], { name: "idx_ficha_acesso_link_aluno" });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_ficha_acesso_link_aluno_ativo ON ficha_acesso_link (aluno_id) WHERE revogado_em IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ficha_acesso_link");
  }
};
