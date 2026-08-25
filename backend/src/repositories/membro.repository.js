"use strict";

const { Op } = require("sequelize");
const { sequelize, Membro, Usuario } = require("../models");

const INCLUDE_USUARIO = { model: Usuario, as: "usuario" };

function findAllByEquipe(equipeId) {
  return Membro.findAll({
    where: { equipe_id: equipeId },
    include: [INCLUDE_USUARIO],
    order: [[{ model: Usuario, as: "usuario" }, "nome", "ASC"]]
  });
}

function findByIdAndEquipe(id, equipeId) {
  return Membro.findOne({ where: { id, equipe_id: equipeId }, include: [INCLUDE_USUARIO] });
}

function findUsuarioPorEmail(email, transaction) {
  return Usuario.findOne({ where: { email }, transaction });
}

// Quantos owners ativos sobrariam na equipe, ignorando o próprio membro em
// questão - usado para checar "não deixar a equipe sem owner" antes de
// aplicar uma mudança de papel/ativo (membro.service.js).
function countOwnersAtivos(equipeId, excetoMembroId) {
  return Membro.count({
    where: {
      equipe_id: equipeId,
      papel: Membro.PAPEL.OWNER,
      ativo: true,
      ...(excetoMembroId ? { id: { [Op.ne]: excetoMembroId } } : {})
    }
  });
}

async function criarComUsuario({ equipeId, nome, email, senha_hash, especialidade, papel }, transaction) {
  const usuario = await Usuario.create({ nome, email, senha_hash, especialidade: especialidade || null }, { transaction });
  const membro = await Membro.create({ equipe_id: equipeId, usuario_id: usuario.id, papel }, { transaction });
  membro.usuario = usuario;
  return membro;
}

async function atualizarUsuario(usuario, dados, transaction) {
  return usuario.update(dados, { transaction });
}

async function atualizarMembro(membro, dados, transaction) {
  return membro.update(dados, { transaction });
}

module.exports = {
  sequelize,
  findAllByEquipe,
  findByIdAndEquipe,
  findUsuarioPorEmail,
  countOwnersAtivos,
  criarComUsuario,
  atualizarUsuario,
  atualizarMembro
};
