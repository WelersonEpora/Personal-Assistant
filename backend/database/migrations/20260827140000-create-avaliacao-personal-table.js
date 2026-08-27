"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md: avaliação escrita pelo
// PRÓPRIO personal sobre o aluno - texto livre, sem IA. Fica na tela de
// Acompanhamento e entra como contexto nos próximos ciclos de IA (mensal e
// análise sob demanda), junto dos relatos. Não é dado oficial nem saída de
// IA - o autor pode editar/excluir livremente.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("avaliacao_personal", {
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
      autor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "CASCADE"
      },
      texto: { type: Sequelize.TEXT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addIndex("avaliacao_personal", ["aluno_id", "created_at"], {
      name: "idx_avaliacao_personal_aluno_data"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("avaliacao_personal");
  }
};
