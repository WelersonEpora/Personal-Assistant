"use strict";

// Isolamento multi-tenant (docs/adr/0011): cada equipe só enxerga os
// próprios alunos. Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Equipe, Aluno } = require("../models");
const alunoService = require("./aluno.service");

let equipeA;
let equipeB;
let alunoDeB;

before(async () => {
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  alunoDeB = await Aluno.create({ equipe_id: equipeB.id, nome: "Aluno da Equipe B" });
});

after(async () => {
  await Aluno.destroy({ where: { id: alunoDeB.id } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
});

test("getAluno: equipe A não consegue acessar aluno da equipe B", async () => {
  await assert.rejects(() => alunoService.getAluno(equipeA.id, alunoDeB.id), /não encontrado/);
});

test("getAluno: equipe dona consegue acessar o próprio aluno", async () => {
  const encontrado = await alunoService.getAluno(equipeB.id, alunoDeB.id);
  assert.equal(encontrado.id, alunoDeB.id);
});

test("listAlunos: lista só traz alunos da equipe autenticada", async (t) => {
  const outroAlunoDeA = await alunoService.createAluno(equipeA.id, { nome: "Aluno da Equipe A" });
  t.after(() => Aluno.destroy({ where: { id: outroAlunoDeA.id } }));

  const listaDeA = await alunoService.listAlunos(equipeA.id);
  assert.equal(listaDeA.length, 1);
  assert.equal(listaDeA[0].id, outroAlunoDeA.id);

  const listaDeB = await alunoService.listAlunos(equipeB.id);
  assert.equal(listaDeB.length, 1);
  assert.equal(listaDeB[0].id, alunoDeB.id);
});

test("createAluno: rejeita nome vazio", async () => {
  await assert.rejects(() => alunoService.createAluno(equipeA.id, { nome: "   " }), /nome/);
});
