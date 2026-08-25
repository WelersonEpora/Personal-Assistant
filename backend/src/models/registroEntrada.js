"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const RegistroEntrada = sequelize.define(
    "RegistroEntrada",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      registro_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      tipo: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [["audio", "texto"]] }
      },
      // Posição de captura dentro do Registro - preserva a ordem original
      // para o contexto consolidado enviado à IA (docs/adr/0006).
      ordem: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      conteudo_texto: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      duracao_segundos: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      tableName: "registro_entrada",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  RegistroEntrada.associate = (models) => {
    RegistroEntrada.belongsTo(models.Registro, { foreignKey: "registro_id", as: "registro" });
    RegistroEntrada.hasOne(models.ArquivoAudio, { foreignKey: "registro_entrada_id", as: "arquivoAudio" });
  };

  return RegistroEntrada;
};
