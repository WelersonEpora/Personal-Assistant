"use strict";

// Geração, revogação, "gerar novo invalida o anterior" e isolamento
// multi-tenant do link de acesso do aluno (docs/adr/0014). Integração -
// toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, FichaAcessoLink } = require("../models");
const fichaAcessoLinkService = require("./fichaAcessoLink.service");

let usuario;
let equipeA;
let equipeB;
let alunoDeA;
let alunoDeB;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  alunoDeA = await Aluno.create({ equipe_id: equipeA.id, nome: "Aluno da Equipe A" });
  alunoDeB = await Aluno.create({ equipe_id: equipeB.id, nome: "Aluno da Equipe B" });
});

after(async () => {
  await FichaAcessoLink.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  await Aluno.destroy({ where: { id: [alunoDeA.id, alunoDeB.id] } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

test("gerar: cria um link com token de alta entropia e validade padrão de 7 dias", async (t) => {
  const antes = Date.now();
  const link = await fichaAcessoLinkService.gerar(equipeA.id, usuario.id, alunoDeA.id, {});
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } }));

  assert.equal(link.status, "ativo");
  assert.match(link.token, /^[A-Za-z0-9_-]{43}$/, "token base64url de 32 bytes");

  const validadeMs = new Date(link.expira_em).getTime() - antes;
  const seteDiasMs = 7 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(validadeMs - seteDiasMs) < 60 * 1000, "expira ~7 dias depois");
});

test("gerar: diasValidade fora de 1..30 é rejeitado", async () => {
  await assert.rejects(
    () => fichaAcessoLinkService.gerar(equipeA.id, usuario.id, alunoDeA.id, { diasValidade: 0 }),
    /diasValidade/
  );
  await assert.rejects(
    () => fichaAcessoLinkService.gerar(equipeA.id, usuario.id, alunoDeA.id, { diasValidade: 31 }),
    /diasValidade/
  );
});

test("gerar: um link novo revoga o anterior (um só ativo por aluno)", async (t) => {
  const primeiro = await fichaAcessoLinkService.gerar(equipeA.id, usuario.id, alunoDeA.id, {});
  const segundo = await fichaAcessoLinkService.gerar(equipeA.id, usuario.id, alunoDeA.id, {});
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } }));

  assert.notEqual(primeiro.token, segundo.token);

  const linhaAntiga = await FichaAcessoLink.findOne({ where: { token: primeiro.token } });
  assert.ok(linhaAntiga.revogado_em, "o primeiro ficou revogado");

  const ativos = await FichaAcessoLink.count({ where: { aluno_id: alunoDeA.id, revogado_em: null } });
  assert.equal(ativos, 1);

  const atual = await fichaAcessoLinkService.obter(equipeA.id, alunoDeA.id);
  assert.equal(atual.token, segundo.token);
});

test("revogar: marca o link ativo como revogado", async (t) => {
  await fichaAcessoLinkService.gerar(equipeA.id, usuario.id, alunoDeA.id, {});
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } }));

  await fichaAcessoLinkService.revogar(equipeA.id, alunoDeA.id);

  const atual = await fichaAcessoLinkService.obter(equipeA.id, alunoDeA.id);
  assert.equal(atual, null, "não há mais link ativo");

  await assert.rejects(() => fichaAcessoLinkService.revogar(equipeA.id, alunoDeA.id), /não tem um link ativo/);
});

test("obter: link expirado (não revogado) aparece com status 'expirado'", async (t) => {
  const link = await fichaAcessoLinkService.gerar(equipeA.id, usuario.id, alunoDeA.id, {});
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } }));

  await FichaAcessoLink.update(
    { expira_em: new Date(Date.now() - 1000) },
    { where: { token: link.token } }
  );

  const atual = await fichaAcessoLinkService.obter(equipeA.id, alunoDeA.id);
  assert.equal(atual.status, "expirado");
});

test("isolamento: personal de outra equipe não gera/obtém/revoga link do aluno alheio", async () => {
  await assert.rejects(
    () => fichaAcessoLinkService.gerar(equipeB.id, usuario.id, alunoDeA.id, {}),
    /Aluno não encontrado/
  );
  await assert.rejects(() => fichaAcessoLinkService.obter(equipeB.id, alunoDeA.id), /Aluno não encontrado/);
  await assert.rejects(() => fichaAcessoLinkService.revogar(equipeB.id, alunoDeA.id), /Aluno não encontrado/);

  const total = await FichaAcessoLink.count({ where: { aluno_id: alunoDeA.id } });
  assert.equal(total, 0, "nada foi criado para o aluno de A pela equipe B");
});
