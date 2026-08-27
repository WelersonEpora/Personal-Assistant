"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0015-acompanhamento-individual-mensal.md: análise pontual a
  // pedido do personal (limite de 1 a cada 7 dias por aluno). NÃO substitui
  // o acompanhamento mensal e NÃO altera o contexto consolidado - por isso
  // não guarda `contexto_consolidado_json`. Nunca é dado oficial.
  const STATUS_VALIDOS = ["gerada", "dados_insuficientes", "falha"];

  const AnaliseSobDemanda = sequelize.define(
    "AnaliseSobDemanda",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      aluno_id: { type: DataTypes.UUID, allowNull: false },
      equipe_id: { type: DataTypes.UUID, allowNull: false },
      solicitada_por: { type: DataTypes.UUID, allowNull: false },
      solicitada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      status: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [STATUS_VALIDOS] } },
      relatos_considerados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      baseada_em_registro_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      contexto_referencia_id: { type: DataTypes.UUID, allowNull: true },
      analise_json: { type: DataTypes.JSONB, allowNull: true },
      provedor: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "gemini" },
      modelo: { type: DataTypes.STRING(60), allowNull: true },
      erro: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "analise_sob_demanda",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  AnaliseSobDemanda.STATUS = Object.fromEntries(STATUS_VALIDOS.map((s) => [s.toUpperCase(), s]));

  AnaliseSobDemanda.associate = (models) => {
    AnaliseSobDemanda.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    AnaliseSobDemanda.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    AnaliseSobDemanda.belongsTo(models.Usuario, { foreignKey: "solicitada_por", as: "solicitadaPor" });
    AnaliseSobDemanda.belongsTo(models.AvaliacaoMensal, { foreignKey: "contexto_referencia_id", as: "contextoReferencia" });
  };

  return AnaliseSobDemanda;
};
