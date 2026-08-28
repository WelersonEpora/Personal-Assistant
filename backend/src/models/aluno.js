"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const Aluno = sequelize.define(
    "Aluno",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      // docs/adr/0011: aluno pertence à equipe (compartilhado entre seus
      // membros), não a um usuario individual.
      equipe_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      nome: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      // Cadastro deliberadamente minimo (docs/adr/0008) - sem plano de
      // treino etc. ate o sistema legado ser analisado.
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // docs/adr/0016: atributos estaveis da pessoa (nao da avaliacao) que a
      // avaliacao fisica consome. Nulos - o cadastro minimo nao os exige; o
      // importador do legado preenche quando o BodyMove tinha o dado.
      data_nascimento: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      sexo: {
        type: DataTypes.STRING(1),
        allowNull: true,
        validate: { isIn: [["F", "M"]] }
      },
      telefone: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      // Nome do arquivo em storage/fotos (ver services/storage-foto.service.js),
      // não a imagem em si - mesmo padrão de arquivo_audio.caminho_armazenamento.
      foto_caminho: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Estrela de favorito - só prioriza a posição do aluno nas listagens
      // (ver aluno.repository.js::findAllByEquipe), sem outro efeito.
      favorito: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Soft-delete - excluir um aluno leva consigo seus Registros/Validacoes
      // (ver aluno.service.js::excluir). NULL = não excluído.
      deletado_em: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: "aluno",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  Aluno.associate = (models) => {
    Aluno.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    Aluno.hasMany(models.Registro, { foreignKey: "aluno_id", as: "registros" });
    Aluno.hasMany(models.FichaTreino, { foreignKey: "aluno_id", as: "fichasTreino" });
    Aluno.hasMany(models.FichaAcessoLink, { foreignKey: "aluno_id", as: "linksFicha" });
    Aluno.hasMany(models.AvaliacaoMensal, { foreignKey: "aluno_id", as: "avaliacoesMensais" });
    Aluno.hasMany(models.AnaliseSobDemanda, { foreignKey: "aluno_id", as: "analisesSobDemanda" });
    Aluno.hasMany(models.AvaliacaoPersonal, { foreignKey: "aluno_id", as: "avaliacoesPersonal" });
    Aluno.hasMany(models.AvaliacaoFisica, { foreignKey: "aluno_id", as: "avaliacoesFisicas" });
  };

  return Aluno;
};
