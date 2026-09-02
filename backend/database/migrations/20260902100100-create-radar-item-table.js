"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md: o que aparece no feed do
// Radar. Ponteiro para uma publicação - NUNCA conhecimento oficial (ilha: não
// tem relação com `resultado_ia`/`validacao`/`avaliacao_fisica*`). Sem
// `equipe_id`: feed global, o mesmo para todos os personais.
//
// `chave_dedup` (hash de título normalizado + domínio da URL) é UNIQUE - o job
// não republica o que já entrou. `visivel = false` esconde um item ruim sem
// apagar o histórico. SEM campo de confiança (decisão da ADR - "confiança da
// IA" seria lida como confiança na informação).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("radar_item", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      execucao_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "radar_execucao", key: "id" },
        onDelete: "SET NULL"
      },
      titulo: { type: Sequelize.TEXT, allowNull: false },
      fonte: { type: Sequelize.TEXT, allowNull: false },
      url: { type: Sequelize.TEXT, allowNull: false },
      // nao_verificado | ok | quebrado (item 'quebrado' nunca aparece no feed)
      url_status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "nao_verificado" },
      url_verificada_em: { type: Sequelize.DATE, allowNull: true },
      // diretriz | position_stand | revisao_sistematica | meta_analise |
      // estudo_primario | consenso | outro
      tipo: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "outro" },
      // "data informada pela IA" - string livre, não brigar com formato
      data_informada: { type: Sequelize.STRING(40), allowNull: true },
      resumo: { type: Sequelize.TEXT, allowNull: false },
      motivo_relevancia: { type: Sequelize.TEXT, allowNull: false },
      assuntos: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      chave_dedup: { type: Sequelize.STRING(120), allowNull: false },
      visivel: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE radar_item ADD CONSTRAINT ck_radar_item_url_status CHECK (
        url_status IN ('nao_verificado', 'ok', 'quebrado')
      );
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE radar_item ADD CONSTRAINT ck_radar_item_tipo CHECK (
        tipo IN ('diretriz', 'position_stand', 'revisao_sistematica', 'meta_analise', 'estudo_primario', 'consenso', 'outro')
      );
    `);

    await queryInterface.addConstraint("radar_item", {
      fields: ["chave_dedup"],
      type: "unique",
      name: "uq_radar_item_chave_dedup"
    });

    await queryInterface.addIndex("radar_item", ["visivel", "url_status", "created_at"], {
      name: "idx_radar_item_feed"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("radar_item");
  }
};
