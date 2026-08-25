"use strict";

const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { UnauthorizedError } = require("../errors");

// Autenticacao por JWT. req.usuarioId, req.equipeId e req.papel ficam
// disponiveis para todo controller/service depois deste middleware - dados
// de dominio (aluno, registro) sao escopados por equipe, nao mais por
// usuario individual (docs/adr/0011-conceito-de-equipe-e-membro.md).
// Ainda NAO ha checagem de autorizacao por papel - deliberadamente fora de
// escopo desta fase.
function autenticar(req, _res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new UnauthorizedError("Token de acesso ausente ou mal formatado."));
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.usuarioId = payload.sub;
    req.equipeId = payload.equipeId;
    req.papel = payload.papel;
    return next();
  } catch (_err) {
    return next(new UnauthorizedError("Token de acesso invalido ou expirado."));
  }
}

module.exports = autenticar;
