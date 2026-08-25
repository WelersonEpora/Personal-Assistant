"use strict";

const { Usuario, Membro, Equipe } = require("../models");

// Inclui membro/equipe já no login (docs/adr/0011) - evita uma 2a consulta
// só pra saber a equipe/papel do usuário autenticado.
function findByEmailComSenha(email) {
  return Usuario.scope("comSenha").findOne({
    where: { email },
    include: [{ model: Membro, as: "membro", include: [{ model: Equipe, as: "equipe" }] }]
  });
}

function findById(id) {
  return Usuario.findByPk(id);
}

module.exports = { findByEmailComSenha, findById };
