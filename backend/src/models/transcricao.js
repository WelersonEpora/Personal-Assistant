"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const Transcricao = sequelize.define(
    "Transcricao",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      arquivo_audio_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
      },
      texto: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      provedor: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "gemini"
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "pendente",
        validate: { isIn: [["pendente", "concluida", "falha"]] }
      },
      erro: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: "transcricao",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Transcricao.associate = (models) => {
    Transcricao.belongsTo(models.ArquivoAudio, { foreignKey: "arquivo_audio_id", as: "arquivoAudio" });
  };

  return Transcricao;
};
