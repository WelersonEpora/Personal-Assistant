"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const FichaAcessoLink = sequelize.define(
    "FichaAcessoLink",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      // docs/adr/0014: o link aponta para o ALUNO (não para uma versão da
      // ficha) - a consulta pública sempre resolve a ficha ativa atual.
      aluno_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Chave de escopo/autorização direta na linha (mesmo padrão de
      // ficha_treino.equipe_id, docs/adr/0011/0013).
      equipe_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      criado_por: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // O segredo em si (capability URL) - gerado com crypto.randomBytes(32)
      // em base64url (docs/adr/0014). Guardado como está, não hasheado: o
      // personal precisa poder recopiar o link. Nunca escrito em log.
      token: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
      },
      expira_em: {
        type: DataTypes.DATE,
        allowNull: false
      },
      // Preenchido ao revogar OU ao gerar um link novo para o mesmo aluno -
      // "gerar um novo invalida o anterior" é o mesmo passo (docs/adr/0014).
      revogado_em: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: "ficha_acesso_link",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  );

  // Um link é UTILIZÁVEL quando não foi revogado e ainda não expirou.
  FichaAcessoLink.prototype.utilizavel = function utilizavel(agora = new Date()) {
    return this.revogado_em === null && new Date(this.expira_em).getTime() > agora.getTime();
  };

  FichaAcessoLink.associate = (models) => {
    FichaAcessoLink.belongsTo(models.Aluno, { foreignKey: "aluno_id", as: "aluno" });
    FichaAcessoLink.belongsTo(models.Equipe, { foreignKey: "equipe_id", as: "equipe" });
    FichaAcessoLink.belongsTo(models.Usuario, { foreignKey: "criado_por", as: "criadoPor" });
  };

  return FichaAcessoLink;
};
