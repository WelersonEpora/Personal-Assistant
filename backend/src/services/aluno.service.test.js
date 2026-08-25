"use strict";

// "Controle de acesso básico" (seção 12 do pedido): cada personal só
// enxerga os próprios alunos. Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Aluno } = require("../models");
const alunoService = require("./aluno.service");

let usuarioA;
let usuarioB;
let alunoDeB;

before(async () => {
  usuarioA = await Usuario.create({ nome: "Personal A", email: `a-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  usuarioB = await Usuario.create({ nome: "Personal B", email: `b-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  alunoDeB = await Aluno.create({ usuario_id: usuarioB.id, nome: "Aluno do Personal B" });
});

after(async () => {
  await Aluno.destroy({ where: { id: alunoDeB.id } });
  await Usuario.destroy({ where: { id: [usuarioA.id, usuarioB.id] } });
});

test("getAluno: personal A não consegue acessar aluno do personal B", async () => {
  await assert.rejects(() => alunoService.getAluno(usuarioA.id, alunoDeB.id), /não encontrado/);
});

test("getAluno: dono consegue acessar o próprio aluno", async () => {
  const encontrado = await alunoService.getAluno(usuarioB.id, alunoDeB.id);
  assert.equal(encontrado.id, alunoDeB.id);
});

test("listAlunos: lista só traz alunos do usuário autenticado", async (t) => {
  const outroAlunoDeA = await alunoService.createAluno(usuarioA.id, { nome: "Aluno do Personal A" });
  t.after(() => Aluno.destroy({ where: { id: outroAlunoDeA.id } }));

  const listaDeA = await alunoService.listAlunos(usuarioA.id);
  assert.equal(listaDeA.length, 1);
  assert.equal(listaDeA[0].id, outroAlunoDeA.id);

  const listaDeB = await alunoService.listAlunos(usuarioB.id);
  assert.equal(listaDeB.length, 1);
  assert.equal(listaDeB[0].id, alunoDeB.id);
});

test("createAluno: rejeita nome vazio", async () => {
  await assert.rejects(() => alunoService.createAluno(usuarioA.id, { nome: "   " }), /nome/);
});
