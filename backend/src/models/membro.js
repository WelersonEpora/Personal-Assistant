"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// docs/adr/0011-conceito-de-equipe-e-membro.md. Papel gravado desde já,
// mas SEM enforcement de autorização nesta fase - qualquer membro faz tudo
// dentro da própria equipe. isIn aqui precisa ficar em sincronia manual com
// o CHECK ck_membro_papel da migration (mesma fragilidade já aceita hoje
// para registro.status).
const PAPEL_VALIDOS = ["owner", "colaborador"];

module.exports = (sequelize) => {
  const Membro = sequelize.define(
    "Membro",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      equipe_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      usuario_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      papel: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "colaborador",
        validate: { isIn: [PAPEL_VALIDOS] }
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: "membro",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Membro.PAPEL = Object.fromEntries(PAPEL_VALIDOS.map((p) => [p.toUpperCase(), p]));

  Membro.associate = (models) => {
    Membro.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    Membro.belongsTo(models.Usuario, { foreignKey: "usuario_id", as: "usuario" });
  };

  return Membro;
};
