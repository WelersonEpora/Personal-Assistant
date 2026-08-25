"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const usuarioRepository = require("../repositories/usuario.repository");
const env = require("../config/env");
const { UnauthorizedError, ValidationError } = require("../shared/errors");

async function login({ email, senha }) {
  if (!email || !senha) {
    throw new ValidationError('"email" e "senha" são obrigatórios.');
  }

  const usuario = await usuarioRepository.findByEmailComSenha(email.trim().toLowerCase());
  if (!usuario) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaValida) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }

  const token = jwt.sign({ sub: usuario.id }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      especialidade: usuario.especialidade
    }
  };
}

module.exports = { login };
