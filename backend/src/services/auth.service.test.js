"use strict";

// docs/adr/0011-conceito-de-equipe-e-membro.md: login precisa devolver a
// equipe/papel do usuário e embutir os dois no JWT, sem uma 2a consulta.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const env = require("../config/env");
const { Usuario, Equipe, Membro } = require("../models");
const authService = require("./auth.service");

const SENHA = "senha-de-teste-123";

let usuario;
let equipe;

before(async () => {
  equipe = await Equipe.create({ nome: `Equipe de Teste ${randomUUID()}` });
  usuario = await Usuario.create({
    nome: "Personal de Teste",
    email: `teste-${randomUUID()}@exemplo.com`,
    senha_hash: await bcrypt.hash(SENHA, 10)
  });
  await Membro.create({ equipe_id: equipe.id, usuario_id: usuario.id, papel: Membro.PAPEL.OWNER });
});

after(async () => {
  await Membro.destroy({ where: { usuario_id: usuario.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
  await Equipe.destroy({ where: { id: equipe.id } });
});

test("login: resposta traz equipe e papel do usuário", async () => {
  const resultado = await authService.login({ email: usuario.email, senha: SENHA });

  assert.equal(resultado.usuario.equipe.id, equipe.id);
  assert.equal(resultado.usuario.equipe.nome, equipe.nome);
  assert.equal(resultado.usuario.papel, "owner");
});

test("login: token JWT carrega equipeId e papel além de sub", async () => {
  const resultado = await authService.login({ email: usuario.email, senha: SENHA });

  const payload = jwt.verify(resultado.token, env.jwt.secret);
  assert.equal(payload.sub, usuario.id);
  assert.equal(payload.equipeId, equipe.id);
  assert.equal(payload.papel, "owner");
});

test("login: senha incorreta rejeita mesmo com e-mail válido", async () => {
  await assert.rejects(() => authService.login({ email: usuario.email, senha: "senha-errada" }), /inválidos/);
});

test("login: membro desativado não consegue logar mesmo com credenciais corretas", async () => {
  const usuarioInativo = await Usuario.create({
    nome: "Membro Inativo",
    email: `inativo-${randomUUID()}@exemplo.com`,
    senha_hash: await bcrypt.hash(SENHA, 10)
  });
  const membroInativo = await Membro.create({
    equipe_id: equipe.id,
    usuario_id: usuarioInativo.id,
    papel: Membro.PAPEL.COLABORADOR,
    ativo: false
  });

  try {
    await assert.rejects(() => authService.login({ email: usuarioInativo.email, senha: SENHA }), /desativad/i);
  } finally {
    await Membro.destroy({ where: { id: membroInativo.id } });
    await Usuario.destroy({ where: { id: usuarioInativo.id } });
  }
});
