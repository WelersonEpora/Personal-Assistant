"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const ArquivoAudio = sequelize.define(
    "ArquivoAudio",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      registro_entrada_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
      },
      // Caminho relativo dentro do diretório de storage (nunca absoluto,
      // nunca servido como estático) - docs/adr/0010.
      caminho_armazenamento: {
        type: DataTypes.STRING(300),
        allowNull: false
      },
      mime_type: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      tamanho_bytes: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: "arquivo_audio",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  ArquivoAudio.associate = (models) => {
    ArquivoAudio.belongsTo(models.RegistroEntrada, { foreignKey: "registro_entrada_id", as: "entrada" });
    ArquivoAudio.hasOne(models.Transcricao, { foreignKey: "arquivo_audio_id", as: "transcricao" });
  };

  return ArquivoAudio;
};
