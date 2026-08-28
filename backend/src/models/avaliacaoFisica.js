"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §6):
  // cabeçalho de uma sessão de avaliação física (evento de um dia). CRUD
  // direto do personal, como `avaliacao_personal` - NÃO passa pelo pipeline
  // de IA e NUNCA vira `validacao` (docs/adr/0007 intacto).
  const ORIGENS_VALIDAS = ["legado_bodymove", "manual"];

  const AvaliacaoFisica = sequelize.define(
    "AvaliacaoFisica",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      aluno_id: { type: DataTypes.UUID, allowNull: false },
      equipe_id: { type: DataTypes.UUID, allowNull: false },
      data: { type: DataTypes.DATEONLY, allowNull: false },
      origem: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [ORIGENS_VALIDAS] } },
      avaliador_id: { type: DataTypes.UUID, allowNull: true },
      // Esquema fechado (proposta v3 §5) - só qualitativo/contextual.
      anamnese_json: { type: DataTypes.JSONB, allowNull: true },
      postural_json: { type: DataTypes.JSONB, allowNull: true },
      observacoes: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      tableName: "avaliacao_fisica",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  AvaliacaoFisica.ORIGENS = Object.fromEntries(ORIGENS_VALIDAS.map((o) => [o.toUpperCase(), o]));

  AvaliacaoFisica.associate = (models) => {
    AvaliacaoFisica.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    AvaliacaoFisica.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    AvaliacaoFisica.belongsTo(models.Usuario, { foreignKey: "avaliador_id", as: "avaliador" });
    AvaliacaoFisica.hasMany(models.AvaliacaoFisicaMedida, {
      foreignKey: "avaliacao_fisica_id",
      as: "medidas",
      onDelete: "CASCADE"
    });
  };

  return AvaliacaoFisica;
};
