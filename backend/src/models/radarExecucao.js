"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0022-radar-atualizacao-profissional.md: log de cada rodada do job
  // do Radar. Guarda prompt + resposta crua do Gemini (auditoria da IA
  // autônoma) e os descartes com motivo. Feed global - sem `equipe_id`.
  const STATUS_VALIDOS = ["rodando", "concluida", "falha"];

  const RadarExecucao = sequelize.define(
    "RadarExecucao",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      iniciada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      concluida_em: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "rodando",
        validate: { isIn: [STATUS_VALIDOS] }
      },
      janela_de: { type: DataTypes.DATEONLY, allowNull: false },
      janela_ate: { type: DataTypes.DATEONLY, allowNull: false },
      modelo: { type: DataTypes.STRING(60), allowNull: true },
      prompt: { type: DataTypes.TEXT, allowNull: true },
      resposta_crua: { type: DataTypes.TEXT, allowNull: true },
      itens_recebidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      itens_publicados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      // [{ titulo, motivo }] - motivo: link_quebrado | duplicado | malformado
      descartes_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      erro: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "radar_execucao",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  RadarExecucao.STATUS = Object.fromEntries(STATUS_VALIDOS.map((s) => [s.toUpperCase(), s]));

  RadarExecucao.associate = (models) => {
    RadarExecucao.hasMany(models.RadarItem, { foreignKey: "execucao_id", as: "itens" });
  };

  return RadarExecucao;
};
