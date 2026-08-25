"use strict";

const { Aluno } = require("../models");

// Todo acesso a Aluno passa por usuario_id - cada personal só enxerga os
// próprios alunos (seção 12 do pedido: "controle de acesso básico").
function findAllByUsuario(usuarioId) {
  return Aluno.findAll({ where: { usuario_id: usuarioId }, order: [["nome", "ASC"]] });
}

function findByIdAndUsuario(id, usuarioId) {
  return Aluno.findOne({ where: { id, usuario_id: usuarioId } });
}

function create({ usuarioId, nome, observacoes }) {
  return Aluno.create({ usuario_id: usuarioId, nome, observacoes: observacoes || null });
}

async function update(aluno, dados) {
  return aluno.update(dados);
}

module.exports = { findAllByUsuario, findByIdAndUsuario, create, update };
