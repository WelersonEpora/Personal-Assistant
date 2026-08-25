"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const Aluno = sequelize.define(
    "Aluno",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      usuario_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      nome: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      // Cadastro deliberadamente minimo (docs/adr/0008) - sem plano de
      // treino, avaliacao fisica etc. ate o sistema legado ser analisado.
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: "aluno",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Aluno.associate = (models) => {
    Aluno.belongsTo(models.Usuario, { foreignKey: "usuario_id", as: "usuario" });
    Aluno.hasMany(models.Registro, { foreignKey: "aluno_id", as: "registros" });
  };

  return Aluno;
};
