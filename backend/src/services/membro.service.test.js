"use strict";

// Isolamento multi-tenant (docs/adr/0011) + regra de "não deixar a equipe
// sem owner" da interface administrativa. Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Equipe, Membro, Usuario } = require("../models");
const membroService = require("./membro.service");

let equipeA;
let equipeB;
let ownerB;
let usuarioOwnerB;

before(async () => {
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });

  usuarioOwnerB = await Usuario.create({
    nome: "Owner da Equipe B",
    email: `owner-b-${randomUUID()}@exemplo.com`,
    senha_hash: "hash-nao-usado-nestes-testes"
  });
  ownerB = await Membro.create({ equipe_id: equipeB.id, usuario_id: usuarioOwnerB.id, papel: Membro.PAPEL.OWNER });
});

after(async () => {
  await Membro.destroy({ where: { equipe_id: [equipeA.id, equipeB.id] } });
  await Usuario.destroy({ where: { id: usuarioOwnerB.id } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
});

test("criarMembro: cria usuario e membro na equipe informada", async (t) => {
  const email = `novo-${randomUUID()}@exemplo.com`;
  const membro = await membroService.criarMembro(equipeA.id, {
    nome: "Novo Colaborador",
    email,
    senha: "senha-valida-123",
    especialidade: "Musculação",
    papel: Membro.PAPEL.COLABORADOR
  });
  t.after(() => Membro.destroy({ where: { id: membro.id } }).then(() => Usuario.destroy({ where: { id: membro.usuario.id } })));

  assert.equal(membro.equipe_id, equipeA.id);
  assert.equal(membro.papel, Membro.PAPEL.COLABORADOR);
  assert.equal(membro.usuario.email, email);
  assert.notEqual(membro.usuario.senha_hash, "senha-valida-123");
});

test("criarMembro: rejeita e-mail já usado por outro usuário", async () => {
  await assert.rejects(
    () =>
      membroService.criarMembro(equipeA.id, {
        nome: "Duplicado",
        email: usuarioOwnerB.email,
        senha: "senha-valida-123",
        papel: Membro.PAPEL.COLABORADOR
      }),
    /e-mail/i
  );
});

test("criarMembro: rejeita senha curta", async () => {
  await assert.rejects(
    () =>
      membroService.criarMembro(equipeA.id, {
        nome: "Fulano",
        email: `curta-${randomUUID()}@exemplo.com`,
        senha: "123",
        papel: Membro.PAPEL.COLABORADOR
      }),
    /senha/i
  );
});

test("listarMembros: só traz membros da própria equipe", async () => {
  const lista = await membroService.listarMembros(equipeB.id);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id, ownerB.id);
});

test("atualizarMembro: equipe A não consegue editar membro da equipe B", async () => {
  await assert.rejects(() => membroService.atualizarMembro(equipeA.id, ownerB.id, { nome: "Hackeado" }), /não encontrado/);
});

test("atualizarMembro: atualiza nome, email e especialidade", async (t) => {
  const membro = await membroService.criarMembro(equipeA.id, {
    nome: "Antes",
    email: `editar-${randomUUID()}@exemplo.com`,
    senha: "senha-valida-123",
    papel: Membro.PAPEL.COLABORADOR
  });
  t.after(() => Membro.destroy({ where: { id: membro.id } }).then(() => Usuario.destroy({ where: { id: membro.usuario.id } })));

  const novoEmail = `depois-${randomUUID()}@exemplo.com`;
  const atualizado = await membroService.atualizarMembro(equipeA.id, membro.id, {
    nome: "Depois",
    email: novoEmail,
    especialidade: "Crossfit"
  });

  assert.equal(atualizado.usuario.nome, "Depois");
  assert.equal(atualizado.usuario.email, novoEmail);
  assert.equal(atualizado.usuario.especialidade, "Crossfit");
});

test("atualizarMembro: bloqueia desativar o único owner ativo da equipe", async () => {
  await assert.rejects(() => membroService.atualizarMembro(equipeB.id, ownerB.id, { ativo: false }), /owner/i);
});

test("atualizarMembro: bloqueia rebaixar o único owner ativo para colaborador", async () => {
  await assert.rejects(
    () => membroService.atualizarMembro(equipeB.id, ownerB.id, { papel: Membro.PAPEL.COLABORADOR }),
    /owner/i
  );
});

test("atualizarMembro: permite desativar um owner quando existe outro owner ativo", async (t) => {
  const segundoOwner = await membroService.criarMembro(equipeB.id, {
    nome: "Segundo Owner",
    email: `segundo-owner-${randomUUID()}@exemplo.com`,
    senha: "senha-valida-123",
    papel: Membro.PAPEL.OWNER
  });
  t.after(async () => {
    await membroService.atualizarMembro(equipeB.id, ownerB.id, { ativo: true });
    await Membro.destroy({ where: { id: segundoOwner.id } });
    await Usuario.destroy({ where: { id: segundoOwner.usuario.id } });
  });

  const atualizado = await membroService.atualizarMembro(equipeB.id, ownerB.id, { ativo: false });
  assert.equal(atualizado.ativo, false);
});

test("atualizarFotoMembro: rejeita formato de imagem não suportado", async () => {
  await assert.rejects(
    () => membroService.atualizarFotoMembro(equipeB.id, ownerB.id, { buffer: Buffer.from("x"), mimeType: "image/gif" }),
    /não suportado/
  );
});

test("obterFotoMembro: rejeita quando o membro pertence a outra equipe", async () => {
  await assert.rejects(() => membroService.obterFotoMembro(equipeA.id, ownerB.id), /não encontrado/);
});
