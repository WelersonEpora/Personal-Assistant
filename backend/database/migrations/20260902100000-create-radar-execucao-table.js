"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md: auditoria de cada rodada do
// job do Radar ("fofoqueira científica"). Guarda o prompt e a resposta crua do
// Gemini (proteção da ADR - "logar prompt e resposta crua") e a base de
// observação da calibração. Sem `equipe_id`: o Radar é um feed global.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("radar_execucao", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      iniciada_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      concluida_em: { type: Sequelize.DATE, allowNull: true },
      // rodando | concluida | falha
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "rodando" },
      janela_de: { type: Sequelize.DATEONLY, allowNull: false },
      janela_ate: { type: Sequelize.DATEONLY, allowNull: false },
      modelo: { type: Sequelize.STRING(60), allowNull: true },
      prompt: { type: Sequelize.TEXT, allowNull: true },
      resposta_crua: { type: Sequelize.TEXT, allowNull: true },
      itens_recebidos: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      itens_publicados: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // [{ titulo, motivo }] - motivo em link_quebrado | duplicado | malformado
      descartes_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      erro: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE radar_execucao ADD CONSTRAINT ck_radar_execucao_status CHECK (
        status IN ('rodando', 'concluida', 'falha')
      );
    `);

    await queryInterface.addIndex("radar_execucao", ["status", "concluida_em"], {
      name: "idx_radar_execucao_status_concluida"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("radar_execucao");
  }
};
