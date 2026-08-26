"use strict";

// Só o auto-atendimento do próprio usuário autenticado (avatar exibido na
// topbar/sidebar do /admin, ver frontend/src/views/admin/AdminShell.vue) -
// edição de foto de qualquer membro (incluindo a própria, pelo owner) é
// feita via membro.service.js::atualizarFotoMembro, escopada por equipe.
const usuarioRepository = require("../repositories/usuario.repository");
const storageFoto = require("./storage-foto.service");
const { NotFoundError } = require("../shared/errors");

async function obterFotoPropria(usuarioId) {
  const usuario = await usuarioRepository.findById(usuarioId);
  if (!usuario || !usuario.foto_caminho) {
    throw new NotFoundError("Usuário não tem foto cadastrada.");
  }
  return storageFoto.ler(usuario.foto_caminho);
}

module.exports = { obterFotoPropria };
