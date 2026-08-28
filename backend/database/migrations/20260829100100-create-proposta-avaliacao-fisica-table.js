"use strict";

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: staging da interpretação
// da IA para Registros `tipo = avaliacao_fisica`. Mesma natureza de
// `resultado_ia` (proposta bruta, NUNCA dado oficial), em tabela própria para
// não confundir os papéis (docs/adr/0007). Escrita só pelo worker de IA; lida
// só pela tela de revisão. `avisos_json` guarda o `nao_mapeado[]` (o que foi
// dito e não encaixou em métrica nenhuma).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("proposta_avaliacao_fisica", {
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
      payload_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      avisos_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      provedor: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "gemini" },
      modelo: { type: Sequelize.STRING(60), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "pendente" },
      erro: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE proposta_avaliacao_fisica ADD CONSTRAINT ck_proposta_af_status CHECK (
        status IN ('pendente', 'concluido', 'falha')
      );
    `);

    // Uma proposta ativa por Registro (mesmo critério de resultado_ia,
    // docs/adr/0007) - reprocessar atualiza a linha, nunca insere uma segunda.
    await queryInterface.addConstraint("proposta_avaliacao_fisica", {
      fields: ["registro_id"],
      type: "unique",
      name: "uq_proposta_af_registro_id"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("proposta_avaliacao_fisica");
  }
};
