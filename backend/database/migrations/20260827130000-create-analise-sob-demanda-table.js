"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md: análise sob demanda -
// o personal pede uma leitura pontual da IA a qualquer momento (limite de 1
// a cada 7 dias por aluno). NÃO substitui o acompanhamento mensal e NÃO
// altera o contexto consolidado do ciclo mensal - é só um apoio pontual,
// nunca dado oficial. Cada solicitação registra data/hora, aluno e quem
// pediu, independentemente do resultado.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("analise_sob_demanda", {
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
      solicitada_por: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "CASCADE"
      },
      solicitada_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      // gerada | dados_insuficientes | falha
      status: { type: Sequelize.STRING(20), allowNull: false },
      relatos_considerados: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      baseada_em_registro_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Avaliação mensal cujo contexto consolidado serviu de referência
      // (somente leitura - a análise sob demanda nunca o altera).
      contexto_referencia_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "avaliacao_mensal", key: "id" },
        onDelete: "SET NULL"
      },
      analise_json: { type: Sequelize.JSONB, allowNull: true },
      provedor: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "gemini" },
      modelo: { type: Sequelize.STRING(60), allowNull: true },
      erro: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addIndex("analise_sob_demanda", ["aluno_id", "solicitada_em"], {
      name: "idx_analise_sob_demanda_aluno_data"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("analise_sob_demanda");
  }
};
