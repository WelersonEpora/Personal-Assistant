"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

const DIFICULDADES_VALIDAS = ["iniciante", "intermediario", "avancado"];

module.exports = (sequelize) => {
  const Exercicio = sequelize.define(
    "Exercicio",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      // docs/adr/0013: NULL = catálogo global do sistema (visível a todas as
      // equipes, mas não editável por elas); preenchido = exercício próprio
      // da equipe, criado e mantido só por ela.
      equipe_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      nome: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      grupo_muscular: {
        type: DataTypes.STRING(60),
        allowNull: true
      },
      equipamento: {
        type: DataTypes.STRING(60),
        allowNull: true
      },
      dificuldade: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: { isIn: [DIFICULDADES_VALIDAS] }
      },
      instrucoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Self-hosted (disco local / volume Docker), mesmo padrão de
      // aluno.foto_caminho (docs/adr/0010) - guarda o nome do arquivo em
      // storage/exercicios, não a imagem em si. Só editável em exercícios
      // próprios da equipe, via POST/DELETE /exercicios/:id/imagem/:posicao.
      // Duas imagens (posição inicial/final do movimento) - mesmo padrão do
      // free-exercise-db, fonte do catálogo global.
      midia_imagem_inicio_caminho: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      midia_imagem_fim_caminho: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      midia_video_url: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Soft-delete (mesmo padrão de aluno) - excluir não pode quebrar itens
      // de fichas de treino que já referenciam este exercício.
      deletado_em: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: "exercicio",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Exercicio.DIFICULDADES = DIFICULDADES_VALIDAS;

  Exercicio.associate = (models) => {
    Exercicio.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    Exercicio.hasMany(models.FichaTreinoExercicio, { foreignKey: "exercicio_id", as: "itensFicha" });
  };

  return Exercicio;
};
