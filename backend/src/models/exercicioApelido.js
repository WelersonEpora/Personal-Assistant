"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// docs/adr/0027: outro nome de um exercício. `equipe_id` NULL = do catálogo
// global (seed); preenchido = apelido daquela equipe. Usado na busca do
// editor de ficha e, depois, na interpretação da ficha por voz.
module.exports = (sequelize) => {
  const ExercicioApelido = sequelize.define(
    "ExercicioApelido",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      exercicio_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      equipe_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      apelido: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      // Chave de comparação (shared/utils/texto.js::normalizarTexto) - os
      // índices únicos da migration são sobre ela, não sobre `apelido`.
      apelido_normalizado: {
        type: DataTypes.STRING(120),
        allowNull: false
      }
    },
    {
      tableName: "exercicio_apelido",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  ExercicioApelido.associate = (models) => {
    ExercicioApelido.belongsTo(models.Exercicio, { foreignKey: "exercicio_id", as: "exercicio" });
    ExercicioApelido.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
  };

  return ExercicioApelido;
};
