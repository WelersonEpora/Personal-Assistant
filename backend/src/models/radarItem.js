"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0022-radar-atualizacao-profissional.md: um ponteiro para uma
  // publicação. NUNCA conhecimento oficial - o personal sempre vai à fonte. A
  // UI carimba o `resumo`/`motivo_relevancia` como "leitura da IA, não
  // conferida". Sem campo de confiança (decisão da ADR).
  const URL_STATUS_VALIDOS = ["nao_verificado", "ok", "quebrado"];
  const TIPOS_VALIDOS = [
    "diretriz",
    "position_stand",
    "revisao_sistematica",
    "meta_analise",
    "estudo_primario",
    "consenso",
    "outro"
  ];

  const RadarItem = sequelize.define(
    "RadarItem",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      execucao_id: { type: DataTypes.UUID, allowNull: true },
      titulo: { type: DataTypes.TEXT, allowNull: false },
      fonte: { type: DataTypes.TEXT, allowNull: false },
      url: { type: DataTypes.TEXT, allowNull: false },
      url_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "nao_verificado",
        validate: { isIn: [URL_STATUS_VALIDOS] }
      },
      url_verificada_em: { type: DataTypes.DATE, allowNull: true },
      tipo: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "outro",
        validate: { isIn: [TIPOS_VALIDOS] }
      },
      data_informada: { type: DataTypes.STRING(40), allowNull: true },
      resumo: { type: DataTypes.TEXT, allowNull: false },
      motivo_relevancia: { type: DataTypes.TEXT, allowNull: false },
      assuntos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      chave_dedup: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      visivel: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "radar_item",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  RadarItem.URL_STATUS = Object.fromEntries(URL_STATUS_VALIDOS.map((s) => [s.toUpperCase(), s]));
  RadarItem.TIPOS = Object.fromEntries(TIPOS_VALIDOS.map((t) => [t.toUpperCase(), t]));

  RadarItem.associate = (models) => {
    RadarItem.belongsTo(models.RadarExecucao, { foreignKey: "execucao_id", as: "execucao" });
  };

  return RadarItem;
};
