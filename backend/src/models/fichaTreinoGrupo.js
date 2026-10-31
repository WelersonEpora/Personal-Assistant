"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

// docs/adr/0026: nível entre a ficha e os exercícios. Exercício isolado é um
// grupo "simples" de um item; bi-set, tri-set e circuito juntam exercícios
// feitos em sequência, com as séries (voltas) e o descanso valendo para o grupo.
const TIPOS = Object.freeze({
  SIMPLES: "simples",
  BISET: "biset",
  TRISET: "triset",
  CIRCUITO: "circuito"
});

module.exports = (sequelize) => {
  const FichaTreinoGrupo = sequelize.define(
    "FichaTreinoGrupo",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      ficha_treino_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Posição do grupo na ficha, 1..N a cada nova versão (mesmo critério de
      // ficha_treino_exercicio.ordem - a ficha nunca é editada item a item).
      ordem: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      tipo: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: TIPOS.SIMPLES,
        validate: { isIn: [Object.values(TIPOS)] }
      },
      // Séries do exercício (simples) ou voltas do grupo (conjugado).
      series: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Texto livre como repeticoes ("60s", "1min30"): entre séries no simples,
      // entre voltas no conjugado.
      descanso: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: "ficha_treino_grupo",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  FichaTreinoGrupo.TIPOS = TIPOS;

  FichaTreinoGrupo.associate = (models) => {
    FichaTreinoGrupo.belongsTo(models.FichaTreino, { foreignKey: "ficha_treino_id", as: "fichaTreino" });
    FichaTreinoGrupo.hasMany(models.FichaTreinoExercicio, { foreignKey: "grupo_id", as: "itens" });
  };

  return FichaTreinoGrupo;
};
