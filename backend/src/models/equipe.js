"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const Equipe = sequelize.define(
    "Equipe",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      nome: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      // Nome do arquivo em storage/fotos (docs/adr/0030), não a imagem em si -
      // mesmo padrão de usuario.foto_caminho.
      logo_caminho: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    },
    {
      tableName: "equipe",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Equipe.associate = (models) => {
    Equipe.hasMany(models.Membro, { foreignKey: "equipe_id", as: "membros" });
    Equipe.hasMany(models.Aluno, { foreignKey: "equipe_id", as: "alunos" });
    Equipe.hasMany(models.Registro, { foreignKey: "equipe_id", as: "registros" });
  };

  return Equipe;
};
