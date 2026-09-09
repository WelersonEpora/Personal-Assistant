"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  // docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md: revisão do
  // personal sobre UMA avaliação mensal (ADR-0015). Portão humano antes do PDF
  // que vai ao aluno - NÃO torna a avaliação oficial (só `validacao` é, ADR-0007),
  // apenas habilita o compartilhamento e entra no próximo ciclo mensal como
  // insumo de peso alto. 1:1 com `avaliacao_mensal`.
  const RevisaoAvaliacaoMensal = sequelize.define(
    "RevisaoAvaliacaoMensal",
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: randomUUID },
      avaliacao_mensal_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      aluno_id: { type: DataTypes.UUID, allowNull: false },
      equipe_id: { type: DataTypes.UUID, allowNull: false },
      autor_id: { type: DataTypes.UUID, allowNull: false },
      comentario: { type: DataTypes.TEXT, allowNull: false },
      itens_excluidos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      avaliacao_gerada_em: { type: DataTypes.DATE, allowNull: false },
      compartilhada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
      tableName: "revisao_avaliacao_mensal",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  RevisaoAvaliacaoMensal.associate = (models) => {
    RevisaoAvaliacaoMensal.belongsTo(models.AvaliacaoMensal, { foreignKey: "avaliacao_mensal_id", as: "avaliacaoMensal" });
    RevisaoAvaliacaoMensal.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    RevisaoAvaliacaoMensal.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    RevisaoAvaliacaoMensal.belongsTo(models.Usuario, { foreignKey: "autor_id", as: "autor" });
    models.AvaliacaoMensal.hasOne(RevisaoAvaliacaoMensal, { foreignKey: "avaliacao_mensal_id", as: "revisao" });
  };

  return RevisaoAvaliacaoMensal;
};
