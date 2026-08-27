"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0015-acompanhamento-individual-mensal.md: avaliação escrita pelo
  // próprio personal (texto livre, sem IA). Entra como contexto nos próximos
  // ciclos de IA junto dos relatos. Não é dado oficial nem saída de IA - o
  // personal edita/exclui livremente.
  const AvaliacaoPersonal = sequelize.define(
    "AvaliacaoPersonal",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      aluno_id: { type: DataTypes.UUID, allowNull: false },
      equipe_id: { type: DataTypes.UUID, allowNull: false },
      autor_id: { type: DataTypes.UUID, allowNull: false },
      texto: { type: DataTypes.TEXT, allowNull: false }
    },
    {
      tableName: "avaliacao_personal",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  AvaliacaoPersonal.associate = (models) => {
    AvaliacaoPersonal.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    AvaliacaoPersonal.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    AvaliacaoPersonal.belongsTo(models.Usuario, { foreignKey: "autor_id", as: "autor" });
  };

  return AvaliacaoPersonal;
};
