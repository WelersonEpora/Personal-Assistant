"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // Único lugar do sistema onde dado OFICIAL é gravado (docs/adr/0007).
  // Só é criado por registro-confirmacao.service.js, dentro da mesma
  // transação que avança registro.status para "confirmado".
  const Validacao = sequelize.define(
    "Validacao",
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
      resultado_ia_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      usuario_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      payload_confirmado_json: {
        type: DataTypes.JSONB,
        allowNull: false
      },
      confirmado_em: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: "validacao",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: false
    }
  );

  Validacao.associate = (models) => {
    Validacao.belongsTo(models.Registro, { foreignKey: "registro_id", as: "registro" });
    Validacao.belongsTo(models.ResultadoIa, { foreignKey: "resultado_ia_id", as: "resultadoIa" });
    Validacao.belongsTo(models.Usuario, { foreignKey: "usuario_id", as: "confirmadoPor" });
  };

  return Validacao;
};
