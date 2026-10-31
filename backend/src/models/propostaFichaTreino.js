"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0028-ficha-de-treino-por-captura-e-ia.md: proposta bruta da IA
  // para um Registro `tipo = ficha_treino`. NUNCA é dado oficial (mesma
  // natureza de proposta_avaliacao_fisica, docs/adr/0018). Escrita só pelo
  // worker de IA; lida só pela tela de revisão. A `ficha_treino` só nasce do
  // fichaTreino.service, acionado pelo personal na confirmação.
  const PropostaFichaTreino = sequelize.define(
    "PropostaFichaTreino",
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
      // { fichas: [{ nome, observacoes, grupos: [{ tipo, series, descanso,
      //   observacoes, itens: [{ exercicio_id, nome_ouvido, repeticoes,
      //   carga_obs, confianca, trecho_origem }] }] }] } - exercicio_id já
      //   traduzido da referência curta do prompt (nulo = não reconhecido).
      payload_json: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      // avisos: [string] - o que a IA não conseguiu estruturar.
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
      tableName: "proposta_ficha_treino",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  PropostaFichaTreino.associate = (models) => {
    PropostaFichaTreino.belongsTo(models.Registro, { foreignKey: "registro_id", as: "registro" });
  };

  return PropostaFichaTreino;
};
