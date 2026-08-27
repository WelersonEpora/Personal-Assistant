"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0015-acompanhamento-individual-mensal.md: interpretação da IA
  // sobre a evolução do aluno no mês. NUNCA é dado oficial (só `validacao`
  // é, docs/adr/0007) - sempre regenerável a partir dos relatos confirmados.
  // Nenhum código que toque esta tabela escreve em `validacao`.
  const STATUS_VALIDOS = ["gerada", "dados_insuficientes", "falha"];
  const ORIGENS_VALIDAS = ["automatica", "manual"];

  const AvaliacaoMensal = sequelize.define(
    "AvaliacaoMensal",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      aluno_id: { type: DataTypes.UUID, allowNull: false },
      equipe_id: { type: DataTypes.UUID, allowNull: false },
      // "YYYY-MM" - mês em que os relatos foram confirmados (docs/adr/0015).
      ano_mes: { type: DataTypes.STRING(7), allowNull: false },
      periodo_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      periodo_fim: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [STATUS_VALIDOS] } },
      origem: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "automatica",
        validate: { isIn: [ORIGENS_VALIDAS] }
      },
      relatos_considerados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      baseada_em_registro_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      // Avaliações do personal (docs/adr/0015) que entraram neste ciclo.
      avaliacoes_personal_consideradas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      avaliacao_json: { type: DataTypes.JSONB, allowNull: true },
      contexto_consolidado_json: { type: DataTypes.JSONB, allowNull: false },
      contexto_anterior_id: { type: DataTypes.UUID, allowNull: true },
      provedor: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "gemini" },
      modelo: { type: DataTypes.STRING(60), allowNull: true },
      erro: { type: DataTypes.TEXT, allowNull: true },
      gerada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
      tableName: "avaliacao_mensal",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  AvaliacaoMensal.STATUS = Object.fromEntries(STATUS_VALIDOS.map((s) => [s.toUpperCase(), s]));

  AvaliacaoMensal.associate = (models) => {
    AvaliacaoMensal.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    AvaliacaoMensal.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    AvaliacaoMensal.belongsTo(models.AvaliacaoMensal, { foreignKey: "contexto_anterior_id", as: "contextoAnterior" });
  };

  return AvaliacaoMensal;
};
