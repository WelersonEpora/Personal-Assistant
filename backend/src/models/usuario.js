"use strict";

const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");

module.exports = (sequelize) => {
  const Usuario = sequelize.define(
    "Usuario",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: randomUUID
      },
      nome: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false
      },
      // Hash bcrypt - nunca a senha em texto puro. Gerado em auth.service.js.
      senha_hash: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      especialidade: {
        type: DataTypes.STRING(160),
        allowNull: true
      },
      // Nome do arquivo em storage/fotos (ver services/storage-foto.service.js),
      // não a imagem em si - mesmo padrão de aluno.foto_caminho.
      foto_caminho: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    },
    {
      tableName: "usuario",
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      // senha_hash nunca sai por padrão de nenhuma consulta - só o login
      // (auth.service.js) precisa dela, via Usuario.scope("comSenha").
      // Chamar .scope() substitui o defaultScope (não soma a ele), então a
      // scope "comSenha" (sem exclude nenhum) basta para trazer o campo de
      // volta só onde for explicitamente pedido.
      defaultScope: {
        attributes: { exclude: ["senha_hash"] }
      },
      scopes: {
        comSenha: {}
      }
    }
  );

  Usuario.associate = (models) => {
    // docs/adr/0011: um usuario pertence a exatamente uma equipe por
    // enquanto (hasOne + uq_membro_usuario_id) - aluno não referencia mais
    // usuario diretamente (ver models/aluno.js), por isso não há mais
    // hasMany(Aluno) aqui.
    Usuario.hasOne(models.Membro, { foreignKey: "usuario_id", as: "membro" });
    Usuario.hasMany(models.Registro, { foreignKey: "usuario_id", as: "registros" });
    Usuario.hasMany(models.Validacao, { foreignKey: "usuario_id", as: "validacoes" });
  };

  return Usuario;
};
