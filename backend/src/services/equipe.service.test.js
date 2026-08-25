"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Equipe, Membro, Usuario } = require("../models");
const equipeService = require("./equipe.service");

let equipe;
let usuario;

before(async () => {
  equipe = await Equipe.create({ nome: `Equipe ${randomUUID()}` });
  usuario = await Usuario.create({
    nome: "Dono",
    email: `dono-${randomUUID()}@exemplo.com`,
    senha_hash: "hash-nao-usado-nestes-testes"
  });
  await Membro.create({ equipe_id: equipe.id, usuario_id: usuario.id, papel: Membro.PAPEL.OWNER });
});

after(async () => {
  await Membro.destroy({ where: { equipe_id: equipe.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
  await Equipe.destroy({ where: { id: equipe.id } });
});

test("obterEquipe: traz nome e total de membros", async () => {
  const resultado = await equipeService.obterEquipe(equipe.id);
  assert.equal(resultado.nome, equipe.nome);
  assert.equal(resultado.totalMembros, 1);
});

test("atualizarNome: rejeita nome vazio", async () => {
  await assert.rejects(() => equipeService.atualizarNome(equipe.id, "   "), /nome/);
});

test("atualizarNome: atualiza o nome da equipe", async (t) => {
  t.after(() => equipeService.atualizarNome(equipe.id, equipe.nome));
  const resultado = await equipeService.atualizarNome(equipe.id, "Nome Atualizado");
  assert.equal(resultado.nome, "Nome Atualizado");
});
