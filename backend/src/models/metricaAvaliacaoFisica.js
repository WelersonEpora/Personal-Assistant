"use strict";

const { DataTypes } = require("sequelize");

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §3):
// catálogo controlado das métricas de avaliação física. Tabela de referência
// (populada por seeder). `avaliacao_fisica_medida` referencia por `codigo`;
// a unidade e o rótulo saem daqui em join com a série - nunca por linha de
// medida.
const CATEGORIAS_VALIDAS = ["antropometria", "composicao", "perimetro", "dobra", "indice", "cardio"];
const UNIDADES_VALIDAS = ["kg", "cm", "mm", "%", "L", "kg/m²", "mL/kg/min", "bpm", "mmHg", "kcal/dia", "adimensional"];
const DIRECOES_VALIDAS = ["menor", "maior", "neutro"];

module.exports = (sequelize) => {
  const MetricaAvaliacaoFisica = sequelize.define(
    "MetricaAvaliacaoFisica",
    {
      codigo: { type: DataTypes.STRING(40), primaryKey: true, allowNull: false },
      rotulo: { type: DataTypes.STRING(80), allowNull: false },
      categoria: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [CATEGORIAS_VALIDAS] } },
      unidade: { type: DataTypes.STRING(12), allowNull: false, validate: { isIn: [UNIDADES_VALIDAS] } },
      casas_decimais: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
      direcao_favoravel: {
        type: DataTypes.STRING(6),
        allowNull: false,
        defaultValue: "neutro",
        validate: { isIn: [DIRECOES_VALIDAS] }
      },
      ordem: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: "metrica_avaliacao_fisica",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  MetricaAvaliacaoFisica.CATEGORIAS = CATEGORIAS_VALIDAS;
  MetricaAvaliacaoFisica.UNIDADES = UNIDADES_VALIDAS;
  MetricaAvaliacaoFisica.DIRECOES = DIRECOES_VALIDAS;

  MetricaAvaliacaoFisica.associate = (models) => {
    MetricaAvaliacaoFisica.hasMany(models.AvaliacaoFisicaMedida, {
      foreignKey: "metrica_codigo",
      sourceKey: "codigo",
      as: "medidas"
    });
  };

  return MetricaAvaliacaoFisica;
};
