"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const FichaTreino = sequelize.define(
    "FichaTreino",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      aluno_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Chave de escopo/autorização (mesmo padrão de registro.equipe_id,
      // docs/adr/0011) - a equipe dona desta ficha.
      equipe_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Qual personal criou esta versão da ficha (auditoria).
      criado_por: {
        type: DataTypes.UUID,
        allowNull: false
      },
      nome: {
        type: DataTypes.STRING(160),
        allowNull: true
      },
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Um aluno pode ter várias fichas ativas (divisão de treino,
      // docs/adr/0026). Fichas anteriores nunca são editadas nem apagadas -
      // uma atualização sempre cria uma linha nova, preservando as anteriores
      // como histórico (docs/adr/0013); arquivar só desliga a ficha.
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Versão anterior que esta ficha substitui (docs/adr/0026): a nova
      // versão desativa só ela. Nulo = ficha nova, somada às ativas. Índice
      // único parcial no banco: uma ficha é substituída no máximo uma vez.
      substitui_id: {
        type: DataTypes.UUID,
        allowNull: true
      }
    },
    {
      tableName: "ficha_treino",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  FichaTreino.associate = (models) => {
    FichaTreino.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    FichaTreino.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    FichaTreino.belongsTo(models.Usuario, { foreignKey: "criado_por", as: "criadoPor" });
    FichaTreino.hasMany(models.FichaTreinoGrupo, { foreignKey: "ficha_treino_id", as: "grupos" });
    FichaTreino.hasMany(models.FichaTreinoExercicio, { foreignKey: "ficha_treino_id", as: "itens" });
  };

  return FichaTreino;
};
