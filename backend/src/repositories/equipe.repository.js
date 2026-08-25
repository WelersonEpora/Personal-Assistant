"use strict";

const { Equipe, Membro } = require("../models");

function findById(id) {
  return Equipe.findByPk(id);
}

function countMembros(equipeId) {
  return Membro.count({ where: { equipe_id: equipeId } });
}

async function update(equipe, dados) {
  return equipe.update(dados);
}

module.exports = { findById, countMembros, update };
