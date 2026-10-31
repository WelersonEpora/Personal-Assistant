"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const FichaTreinoExercicio = sequelize.define(
    "FichaTreinoExercicio",
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
      // Grupo do exercício (docs/adr/0026) - séries/voltas e descanso vivem no
      // grupo, não no item.
      grupo_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      exercicio_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Posição do exercício dentro do grupo - sempre reatribuída de 1..N a
      // cada nova versão da ficha (não precisa tolerar gaps como
      // registro_entrada.ordem, porque a ficha é sempre substituída por
      // inteiro, nunca editada item a item).
      ordem: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Texto livre (não inteiro) - permite faixas ("8-12"), tempo ("30s")
      // ou instruções como "até a falha", mesmo critério de aluno.observacoes.
      repeticoes: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      carga_obs: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: "ficha_treino_exercicio",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  FichaTreinoExercicio.associate = (models) => {
    FichaTreinoExercicio.belongsTo(models.FichaTreino, { foreignKey: "ficha_treino_id", as: "fichaTreino" });
    FichaTreinoExercicio.belongsTo(models.FichaTreinoGrupo, { foreignKey: "grupo_id", as: "grupo" });
    FichaTreinoExercicio.belongsTo(models.Exercicio, { foreignKey: "exercicio_id", as: "exercicio" });
  };

  return FichaTreinoExercicio;
};
