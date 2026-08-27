"use strict";

// Preservação de histórico (sem versionamento explícito) e isolamento
// multi-tenant da Ficha de Treino (docs/adr/0013). Integração - toca o
// banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Exercicio, FichaTreino } = require("../models");
const fichaTreinoService = require("./fichaTreino.service");

let usuario;
let equipeA;
let equipeB;
let alunoDeA;
let alunoDeB;
let exercicioSupino;
let exercicioAgachamento;
let exercicioDeB;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  alunoDeA = await Aluno.create({ equipe_id: equipeA.id, nome: "Aluno da Equipe A" });
  alunoDeB = await Aluno.create({ equipe_id: equipeB.id, nome: "Aluno da Equipe B" });
  exercicioSupino = await Exercicio.create({ equipe_id: null, nome: "Supino reto" });
  exercicioAgachamento = await Exercicio.create({ equipe_id: equipeA.id, nome: "Agachamento livre" });
  exercicioDeB = await Exercicio.create({ equipe_id: equipeB.id, nome: "Exercício próprio de B" });
});

after(async () => {
  await FichaTreino.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  await Exercicio.destroy({ where: { id: [exercicioSupino.id, exercicioAgachamento.id, exercicioDeB.id] } });
  await Aluno.destroy({ where: { id: [alunoDeA.id, alunoDeB.id] } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

test("criarNovaVersao: rejeita aluno de outra equipe", async () => {
  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeB.id, { itens: [{ exercicioId: exercicioSupino.id }] }),
    /Aluno não encontrado/
  );
});

test("criarNovaVersao: rejeita lista de itens vazia", async () => {
  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { itens: [] }),
    /itens/
  );
});

test("criarNovaVersao: rejeita exercício de outra equipe", async () => {
  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { itens: [{ exercicioId: exercicioDeB.id }] }),
    /não existem, estão inativos, ou não pertencem/
  );
});

test("criarNovaVersao: rejeita exercício inativo (não pode entrar em ficha nova)", async (t) => {
  const inativo = await Exercicio.create({ equipe_id: equipeA.id, nome: "Exercício desativado", ativo: false });
  t.after(() => Exercicio.destroy({ where: { id: inativo.id } }));

  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { itens: [{ exercicioId: inativo.id }] }),
    /inativos/
  );
});

test("criarNovaVersao: exercício desativado depois de já usado continua resolvendo normalmente em ficha antiga", async (t) => {
  const exercicio = await Exercicio.create({ equipe_id: equipeA.id, nome: "Exercício que será desativado" });
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { itens: [{ exercicioId: exercicio.id }] });
  t.after(async () => {
    await FichaTreino.destroy({ where: { id: ficha.id } });
    await Exercicio.destroy({ where: { id: exercicio.id } });
  });

  await exercicio.update({ ativo: false });

  const recarregada = await fichaTreinoService.obterDetalhe(equipeA.id, ficha.id);
  assert.equal(recarregada.itens[0].exercicio.id, exercicio.id);
  assert.equal(recarregada.itens[0].exercicio.ativo, false);
});

test("criarNovaVersao: cria a ficha ativa com itens (global + próprio) na ordem enviada", async (t) => {
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Treino A",
    itens: [
      { exercicioId: exercicioSupino.id, series: 4, repeticoes: "8-12" },
      { exercicioId: exercicioAgachamento.id, series: 3, repeticoes: "10" }
    ]
  });
  t.after(() => FichaTreino.destroy({ where: { id: ficha.id } }));

  assert.equal(ficha.ativo, true);
  assert.equal(ficha.itens.length, 2);
  assert.equal(ficha.itens[0].ordem, 1);
  assert.equal(ficha.itens[0].exercicio.id, exercicioSupino.id);
  assert.equal(ficha.itens[1].ordem, 2);
});

test("criarNovaVersao: uma nova versão desativa a anterior sem apagá-la (histórico preservado)", async (t) => {
  const primeira = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    itens: [{ exercicioId: exercicioSupino.id }]
  });
  const segunda = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    itens: [{ exercicioId: exercicioAgachamento.id }]
  });
  t.after(() => FichaTreino.destroy({ where: { id: [primeira.id, segunda.id] } }));

  const ativa = await fichaTreinoService.obterAtiva(equipeA.id, alunoDeA.id);
  assert.equal(ativa.id, segunda.id);

  const primeiraRecarregada = await fichaTreinoService.obterDetalhe(equipeA.id, primeira.id);
  assert.equal(primeiraRecarregada.ativo, false);
  assert.equal(primeiraRecarregada.itens[0].exercicio.id, exercicioSupino.id, "itens da versão antiga continuam intactos");

  const historico = await fichaTreinoService.listarPorAluno(equipeA.id, alunoDeA.id);
  assert.deepEqual(
    historico.map((f) => f.id),
    [segunda.id, primeira.id]
  );
});

test("obterAtiva: retorna null quando o aluno não tem nenhuma ficha", async () => {
  const ativa = await fichaTreinoService.obterAtiva(equipeB.id, alunoDeB.id);
  assert.equal(ativa, null);
});

test("obterDetalhe: rejeita ficha de outra equipe", async (t) => {
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    itens: [{ exercicioId: exercicioSupino.id }]
  });
  t.after(() => FichaTreino.destroy({ where: { id: ficha.id } }));

  await assert.rejects(() => fichaTreinoService.obterDetalhe(equipeB.id, ficha.id), /não encontrada/);
});
