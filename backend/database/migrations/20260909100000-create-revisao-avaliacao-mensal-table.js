"use strict";

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md: revisão do
// personal sobre UMA avaliação mensal (ADR-0015), pré-requisito para gerar o
// PDF que vai ao aluno. 1:1 com `avaliacao_mensal`. Não é dado oficial e nada
// aqui escreve em `validacao` (ADR-0007) - só habilita o compartilhamento
// externo e entra como insumo de peso alto no próximo ciclo mensal.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("revisao_avaliacao_mensal", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      avaliacao_mensal_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "avaliacao_mensal", key: "id" },
        onDelete: "CASCADE"
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
      // Texto livre do personal voltado ao aluno. Vai no PDF e no próximo
      // ciclo mensal de IA (peso alto, origem "revisao_mensal:<id>").
      comentario: { type: Sequelize.TEXT, allowNull: false },
      // Chaves dos itens da avaliação que o personal tirou do PDF. Só afeta o
      // PDF - não muda o que a IA vê.
      itens_excluidos: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Cópia de avaliacao_mensal.gerada_em no momento da revisão - detecta
      // "avaliação regerada depois da revisão" (trava o PDF até revisar de novo).
      avaliacao_gerada_em: { type: Sequelize.DATE, allowNull: false },
      compartilhada_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addIndex("revisao_avaliacao_mensal", ["aluno_id"], {
      name: "idx_revisao_avaliacao_mensal_aluno"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("revisao_avaliacao_mensal");
  }
};
