"use strict";

const { Membro } = require("../../models");
const { ForbiddenError } = require("../errors");

// Roda depois de auth.middleware.js (precisa de req.papel já definido).
// Só usado nas rotas novas de equipe/membro - docs/adr/0011 deixa
// deliberadamente sem enforcement por papel em aluno/registro.
function exigirOwner(req, _res, next) {
  if (req.papel !== Membro.PAPEL.OWNER) {
    return next(new ForbiddenError("Acesso restrito ao owner da equipe."));
  }
  return next();
}

module.exports = { exigirOwner };
