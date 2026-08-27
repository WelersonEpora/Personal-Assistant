"use strict";

const { randomBytes } = require("node:crypto");

// docs/adr/0014-acesso-aluno-ficha-por-link.md: token de link do aluno.
// 32 bytes = 256 bits de entropia de um CSPRNG (nunca Math.random nem UUID,
// que não é feito para ser imprevisível), em base64url - 43 caracteres,
// seguros num segmento de URL sem escaping.
function gerarTokenSeguro() {
  return randomBytes(32).toString("base64url");
}

module.exports = { gerarTokenSeguro };
