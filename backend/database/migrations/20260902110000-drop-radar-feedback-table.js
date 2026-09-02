"use strict";

// docs/adr/0022 (adendo 2026-09-02): o feedback do Radar ("útil / irrelevante
// / enganoso") foi removido - sem revisor comprometido a olhar o agregado, e
// num feed global de baixo volume, não tinha ação clara. Qualidade fica com o
// operador (npm run radar:execucoes). A tabela nunca foi para produção.
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable("radar_feedback");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable("radar_feedback", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      radar_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "radar_item", key: "id" },
        onDelete: "CASCADE"
      },
      usuario_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "CASCADE"
      },
      valor: { type: Sequelize.STRING(12), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE radar_feedback ADD CONSTRAINT ck_radar_feedback_valor CHECK (
        valor IN ('util', 'irrelevante', 'enganoso')
      );
    `);
    await queryInterface.addConstraint("radar_feedback", {
      fields: ["radar_item_id", "usuario_id"],
      type: "unique",
      name: "uq_radar_feedback_item_usuario"
    });
  }
};
