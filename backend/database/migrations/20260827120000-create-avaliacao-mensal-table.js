"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md: avaliação mensal do
// aluno gerada pela IA a partir dos relatos confirmados do mês + do contexto
// consolidado do mês anterior. NUNCA é dado oficial (isso continua sendo só
// `validacao`, docs/adr/0007) - é uma interpretação da IA, sempre
// regenerável. Um registro por (aluno, mês de referência).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("avaliacao_mensal", {
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
      // Mês de referência "YYYY-MM" - o mês em que os relatos foram
      // CONFIRMADOS (confirmado_em), não a data da sessão (ver docs/adr/0015).
      ano_mes: { type: Sequelize.STRING(7), allowNull: false },
      periodo_inicio: { type: Sequelize.DATEONLY, allowNull: false },
      periodo_fim: { type: Sequelize.DATEONLY, allowNull: false },
      // gerada | dados_insuficientes | falha
      status: { type: Sequelize.STRING(20), allowNull: false },
      // automatica (job mensal) | manual (personal disparou/regerou)
      origem: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "automatica" },
      relatos_considerados: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // ids dos Registros confirmados que entraram nesta avaliação (rastreio)
      baseada_em_registro_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Avaliação voltada para leitura do personal (null quando não gerada)
      avaliacao_json: { type: Sequelize.JSONB, allowNull: true },
      // Contexto compacto que alimenta o PRÓXIMO ciclo (sempre presente -
      // mesmo em "dados_insuficientes"/"falha" o contexto anterior é
      // carregado adiante)
      contexto_consolidado_json: { type: Sequelize.JSONB, allowNull: false },
      // Qual avaliação forneceu o contexto de entrada deste ciclo
      contexto_anterior_id: { type: Sequelize.UUID, allowNull: true },
      provedor: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "gemini" },
      modelo: { type: Sequelize.STRING(60), allowNull: true },
      erro: { type: Sequelize.TEXT, allowNull: true },
      gerada_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addConstraint("avaliacao_mensal", {
      fields: ["contexto_anterior_id"],
      type: "foreign key",
      name: "fk_avaliacao_mensal_contexto_anterior",
      references: { table: "avaliacao_mensal", field: "id" },
      onDelete: "SET NULL"
    });

    // Um registro por aluno/mês - a regeneração sobrescreve a linha, não
    // acumula versões (não é dado oficial, docs/adr/0015). O índice desta
    // constraint também serve as consultas por (aluno_id, ano_mes).
    await queryInterface.addConstraint("avaliacao_mensal", {
      fields: ["aluno_id", "ano_mes"],
      type: "unique",
      name: "uq_avaliacao_mensal_aluno_mes"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("avaliacao_mensal");
  }
};
