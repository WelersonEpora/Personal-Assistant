"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: proposta bruta da IA
  // para um Registro `tipo = avaliacao_fisica`. NUNCA é dado oficial (mesma
  // natureza de `resultado_ia`, docs/adr/0007). Escrita só pelo worker de IA;
  // lida só pela tela de revisão. A `avaliacao_fisica` só nasce do
  // avaliacao-fisica.service, acionado pelo personal na confirmação.
  const PropostaAvaliacaoFisica = sequelize.define(
    "PropostaAvaliacaoFisica",
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
      // { data_ouvida, medidas: [{ metrica_codigo, metodo, valor,
      //   unidade_ouvida, principal, confianca, trecho_origem }], observacoes }
      payload_json: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      // nao_mapeado: [{ trecho, motivo }] - o que foi dito e não virou métrica.
      avisos_json: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
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
      tableName: "proposta_avaliacao_fisica",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  PropostaAvaliacaoFisica.associate = (models) => {
    PropostaAvaliacaoFisica.belongsTo(models.Registro, { foreignKey: "registro_id", as: "registro" });
  };

  return PropostaAvaliacaoFisica;
};
