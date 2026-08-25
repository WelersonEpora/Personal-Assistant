"use strict";

const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { UnauthorizedError } = require("../errors");

// Autenticacao simples por JWT (secao 6/12 do pedido: "controle de acesso
// basico", sem multi-tenant complexo). req.usuarioId fica disponivel para
// todo controller/service depois deste middleware escopar dados por dono
// (ver aluno.service.js, registro.service.js).
function autenticar(req, _res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new UnauthorizedError("Token de acesso ausente ou mal formatado."));
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.usuarioId = payload.sub;
    return next();
  } catch (_err) {
    return next(new UnauthorizedError("Token de acesso invalido ou expirado."));
  }
}

module.exports = autenticar;
