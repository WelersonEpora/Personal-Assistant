"use strict";

const usuarioService = require("../services/usuario.service");

async function streamFotoPropria(req, res) {
  const { buffer, mimeType } = await usuarioService.obterFotoPropria(req.usuarioId);
  res.set("Content-Type", mimeType);
  res.send(buffer);
}

module.exports = { streamFotoPropria };
