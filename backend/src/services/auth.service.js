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
  // Provisionamento (scripts/criar-usuario.js) sempre cria um membro junto
  // com o usuario - usuario sem membro/equipe não deveria existir, mas
  // tratamos como credencial inválida em vez de estourar um erro interno.
  if (!usuario || !usuario.membro || !usuario.membro.equipe) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaValida) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }

  // Membro desativado pelo owner (interface administrativa) perde acesso
  // imediatamente, mesmo com credenciais corretas.
  if (!usuario.membro.ativo) {
    throw new UnauthorizedError("Usuário desativado. Fale com o responsável da equipe.");
  }

  const token = jwt.sign(
    { sub: usuario.id, equipeId: usuario.membro.equipe.id, papel: usuario.membro.papel },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      especialidade: usuario.especialidade,
      equipe: { id: usuario.membro.equipe.id, nome: usuario.membro.equipe.nome },
      papel: usuario.membro.papel
    }
  };
}

module.exports = { login };
