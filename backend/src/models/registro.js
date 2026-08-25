"use strict";

const { DataTypes } = require("sequelize");

// Status de servidor do Registro (docs/adr/0002-conceito-de-registro.md).
// Os estados locais do celular (local/aguardando_sincronizacao/
// sincronizando) NUNCA aparecem aqui - existem só no IndexedDB do cliente.
const STATUS_VALIDOS = [
  "recebido",
  "transcrevendo",
  "interpretando",
  "aguardando_revisao",
  "confirmado",
  "erro_transcricao",
  "erro_interpretacao"
];

module.exports = (sequelize) => {
  const Registro = sequelize.define(
    "Registro",
    {
      // Sem defaultValue de proposito: o id nasce no CLIENTE
      // (crypto.randomUUID() no celular, ver docs/adr/0002 e 0005) e chega
      // pronto no POST /registros/:id/sincronizar - é a chave de
      // idempotência de toda a sincronização. Nunca gerar aqui.
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false
      },
      usuario_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      aluno_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      titulo: {
        type: DataTypes.STRING(160),
        allowNull: true
      },
      iniciado_em: {
        type: DataTypes.DATE,
        allowNull: false
      },
      finalizado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "recebido",
        validate: { isIn: [STATUS_VALIDOS] }
      }
    },
    {
      tableName: "registro",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Registro.STATUS = Object.fromEntries(STATUS_VALIDOS.map((s) => [s.toUpperCase(), s]));

  Registro.associate = (models) => {
    Registro.belongsTo(models.Usuario, { foreignKey: "usuario_id", as: "usuario" });
    Registro.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    Registro.hasMany(models.RegistroEntrada, { foreignKey: "registro_id", as: "entradas" });
    Registro.hasOne(models.ResultadoIa, { foreignKey: "registro_id", as: "resultadoIa" });
    Registro.hasOne(models.Validacao, { foreignKey: "registro_id", as: "validacao" });
  };

  return Registro;
};
