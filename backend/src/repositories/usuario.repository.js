"use strict";

const { Usuario } = require("../models");

function findByEmailComSenha(email) {
  return Usuario.scope("comSenha").findOne({ where: { email } });
}

function findById(id) {
  return Usuario.findByPk(id);
}

module.exports = { findByEmailComSenha, findById };
