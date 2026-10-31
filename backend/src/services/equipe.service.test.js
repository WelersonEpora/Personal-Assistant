"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Equipe, Membro, Usuario } = require("../models");
const equipeService = require("./equipe.service");
const storageFoto = require("./storage-foto.service");

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

// docs/adr/0030 - logo da equipe.
test("atualizarLogo: rejeita formato não suportado (SVG fica de fora)", async () => {
  await assert.rejects(
    () => equipeService.atualizarLogo(equipe.id, { buffer: Buffer.from("<svg/>"), mimeType: "image/svg+xml" }),
    /Formato/
  );
});

test("removerLogo: rejeita quando a equipe não tem logo", async () => {
  await assert.rejects(() => equipeService.removerLogo(equipe.id), /não tem logo/);
});

test("logo: envio, leitura, identidade, troca de formato e remoção", async (t) => {
  t.after(async () => {
    const atual = await Equipe.findByPk(equipe.id);
    if (atual.logo_caminho) await equipeService.removerLogo(equipe.id);
  });

  const comLogo = await equipeService.atualizarLogo(equipe.id, { buffer: Buffer.from("logo-jpeg"), mimeType: "image/jpeg" });
  assert.equal(comLogo.temLogo, true);
  assert.deepEqual(await equipeService.obterIdentidade(equipe.id), { nome: equipe.nome, temLogo: true });
  assert.equal((await equipeService.obterLogo(equipe.id)).buffer.toString(), "logo-jpeg");

  // Trocar de formato substitui o arquivo e apaga o anterior.
  const anterior = (await Equipe.findByPk(equipe.id)).logo_caminho;
  await equipeService.atualizarLogo(equipe.id, { buffer: Buffer.from("logo-png"), mimeType: "image/png" });
  const { buffer, mimeType } = await equipeService.obterLogo(equipe.id);
  assert.equal(buffer.toString(), "logo-png");
  assert.equal(mimeType, "image/png");
  await assert.rejects(() => storageFoto.ler(anterior), /ENOENT/);

  const semLogo = await equipeService.removerLogo(equipe.id);
  assert.equal(semLogo.temLogo, false);
  await assert.rejects(() => equipeService.obterLogo(equipe.id), /não tem logo/);
});
