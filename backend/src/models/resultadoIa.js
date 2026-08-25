"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // Proposta bruta da IA - NUNCA é dado oficial (docs/adr/0007-separacao-
  // ia-persistencia.md). Só o service de confirmação lê isto para
  // apresentar ao personal; nenhum outro código deve tratar payload_json
  // como verdade confirmada.
  const ResultadoIa = sequelize.define(
    "ResultadoIa",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      registro_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true
      },
      payload_json: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      provedor: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "gemini"
      },
      modelo: {
        type: DataTypes.STRING(60),
        allowNull: true
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "pendente",
        validate: { isIn: [["pendente", "concluido", "falha"]] }
      },
      erro: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: "resultado_ia",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  ResultadoIa.associate = (models) => {
    ResultadoIa.belongsTo(models.Registro, { foreignKey: "registro_id", as: "registro" });
    ResultadoIa.hasOne(models.Validacao, { foreignKey: "resultado_ia_id", as: "validacao" });
  };

  return ResultadoIa;
};
