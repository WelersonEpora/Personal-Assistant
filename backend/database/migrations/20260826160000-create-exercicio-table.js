"use strict";

// docs/adr/0013-catalogo-exercicios-ficha-treino.md: equipe_id anulável -
// NULL identifica um exercício do catálogo global do sistema (visível a
// todas as equipes, não editável por elas); preenchido identifica um
// exercício próprio, criado e mantido só por aquela equipe.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("exercicio", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      equipe_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "equipe", key: "id" },
        onDelete: "CASCADE"
      },
      nome: { type: Sequelize.STRING(120), allowNull: false },
      grupo_muscular: { type: Sequelize.STRING(60), allowNull: true },
      equipamento: { type: Sequelize.STRING(60), allowNull: true },
      dificuldade: { type: Sequelize.STRING(20), allowNull: true },
      instrucoes: { type: Sequelize.TEXT, allowNull: true },
      midia_imagem_url: { type: Sequelize.STRING(500), allowNull: true },
      midia_video_url: { type: Sequelize.STRING(500), allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      deletado_em: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE exercicio ADD CONSTRAINT ck_exercicio_dificuldade CHECK (
        dificuldade IS NULL OR dificuldade IN ('iniciante', 'intermediario', 'avancado')
      );
    `);

    await queryInterface.addIndex("exercicio", ["equipe_id"], { name: "idx_exercicio_equipe_id" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("exercicio");
  }
};
