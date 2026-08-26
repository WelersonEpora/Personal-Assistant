"use strict";

// Isolamento multi-tenant (docs/adr/0011): cada equipe só enxerga os
// próprios alunos. Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Registro } = require("../models");
const alunoService = require("./aluno.service");

let usuario;
let equipeA;
let equipeB;
let alunoDeB;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  alunoDeB = await Aluno.create({ equipe_id: equipeB.id, nome: "Aluno da Equipe B" });
});

after(async () => {
  await Aluno.destroy({ where: { id: alunoDeB.id } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
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

test("createAluno: aceita telefone e updateAluno permite alterá-lo", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno com telefone", telefone: "11999990000" });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  assert.equal(aluno.telefone, "11999990000");

  const atualizado = await alunoService.updateAluno(equipeA.id, aluno.id, { telefone: "11888880000" });
  assert.equal(atualizado.telefone, "11888880000");
});

test("atualizarFoto: rejeita formato de imagem não suportado", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno para foto" });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  await assert.rejects(
    () => alunoService.atualizarFoto(equipeA.id, aluno.id, { buffer: Buffer.from("x"), mimeType: "image/gif" }),
    /não suportado/
  );
});

// Regra central desta feature: excluir um aluno leva consigo todos os seus
// Registros (docs de arquitetura do produto - relatos/avaliações não fazem
// sentido sem o aluno dono).
test("excluirAluno: soft-delete some da listagem e leva os Registros do aluno junto", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno a excluir" });
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipeA.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status: Registro.STATUS.CONFIRMADO
  });
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await Aluno.destroy({ where: { id: aluno.id } });
  });

  await alunoService.excluirAluno(equipeA.id, aluno.id);

  await assert.rejects(() => alunoService.getAluno(equipeA.id, aluno.id), /não encontrado/);

  const registroAtualizado = await Registro.findByPk(registro.id);
  assert.ok(registroAtualizado.deletado_em, "deletado_em do Registro deveria estar preenchido");
});

test("excluirAluno: rejeita quando o aluno pertence a outra equipe", async () => {
  await assert.rejects(() => alunoService.excluirAluno(equipeA.id, alunoDeB.id), /não encontrado/);
});
