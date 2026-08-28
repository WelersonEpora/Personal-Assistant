"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

const { METODOS_VALIDOS } = require("../services/avaliacao-fisica/metodos");

module.exports = (sequelize) => {
  // docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §4/§6):
  // 1 linha por métrica × método de uma avaliação. `valor` sempre na unidade
  // canônica da métrica (lida do catálogo). `principal` marca o valor
  // acompanhado da métrica naquela avaliação (a série "linha única" do
  // gráfico usa `WHERE principal`).
  const ORIGENS_VALOR_VALIDAS = ["medido", "calculado", "importado"];

  const AvaliacaoFisicaMedida = sequelize.define(
    "AvaliacaoFisicaMedida",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      avaliacao_fisica_id: { type: DataTypes.UUID, allowNull: false },
      metrica_codigo: { type: DataTypes.STRING(40), allowNull: false },
      metodo: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "direto",
        validate: { isIn: [METODOS_VALIDOS] }
      },
      principal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // NUMERIC(8,3) no banco - Sequelize devolve string; quem consome converte.
      valor: { type: DataTypes.DECIMAL(8, 3), allowNull: false },
      origem_valor: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [ORIGENS_VALOR_VALIDAS] }
      }
    },
    {
      tableName: "avaliacao_fisica_medida",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  AvaliacaoFisicaMedida.ORIGENS_VALOR = ORIGENS_VALOR_VALIDAS;

  AvaliacaoFisicaMedida.associate = (models) => {
    AvaliacaoFisicaMedida.belongsTo(models.AvaliacaoFisica, {
      foreignKey: "avaliacao_fisica_id",
      as: "avaliacao"
    });
    AvaliacaoFisicaMedida.belongsTo(models.MetricaAvaliacaoFisica, {
      foreignKey: "metrica_codigo",
      targetKey: "codigo",
      as: "metrica"
    });
  };

  return AvaliacaoFisicaMedida;
};
