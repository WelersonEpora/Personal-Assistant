"use strict";

// docs/adr/0015: avaliação escrita pelo próprio personal (texto livre, sem
// IA). CRUD escopado por equipe. Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, AvaliacaoPersonal } = require("../models");
const avaliacaoPersonalService = require("./avaliacao-personal.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;
let alunoDeOutra;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `t-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipe = await Equipe.create({ nome: `Equipe ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno de Teste" });
  alunoDeOutra = await Aluno.create({ equipe_id: outraEquipe.id, nome: "Aluno de Outra" });
});

after(async () => {
  await AvaliacaoPersonal.destroy({ where: { aluno_id: [aluno.id, alunoDeOutra.id] } });
  await Aluno.destroy({ where: { id: [aluno.id, alunoDeOutra.id] } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

test("criar: grava o texto e o autor, escopado ao aluno/equipe", async (t) => {
  t.after(() => AvaliacaoPersonal.destroy({ where: { aluno_id: aluno.id } }));

  const avaliacao = await avaliacaoPersonalService.criar(equipe.id, aluno.id, usuario.id, {
    texto: "  Aluno mais consistente este mês, dormindo melhor.  "
  });

  assert.equal(avaliacao.texto, "Aluno mais consistente este mês, dormindo melhor.");
  assert.equal(avaliacao.autor_id, usuario.id);
  assert.equal(avaliacao.autor.nome, "Personal");
});

test("criar: rejeita texto vazio", async () => {
  await assert.rejects(() => avaliacaoPersonalService.criar(equipe.id, aluno.id, usuario.id, { texto: "   " }), /obrigat/i);
});

test("criar: rejeita aluno de outra equipe", async () => {
  await assert.rejects(
    () => avaliacaoPersonalService.criar(equipe.id, alunoDeOutra.id, usuario.id, { texto: "x" }),
    /não encontrado/
  );
});

test("atualizar e excluir a própria avaliação", async (t) => {
  t.after(() => AvaliacaoPersonal.destroy({ where: { aluno_id: aluno.id } }));

  const criada = await avaliacaoPersonalService.criar(equipe.id, aluno.id, usuario.id, { texto: "rascunho" });
  const editada = await avaliacaoPersonalService.atualizar(equipe.id, aluno.id, criada.id, { texto: "versão final" });
  assert.equal(editada.texto, "versão final");

  await avaliacaoPersonalService.excluir(equipe.id, aluno.id, criada.id);
  const lista = await avaliacaoPersonalService.listar(equipe.id, aluno.id);
  assert.equal(lista.length, 0);
});

test("atualizar: rejeita avaliação de outra equipe", async (t) => {
  const criada = await avaliacaoPersonalService.criar(outraEquipe.id, alunoDeOutra.id, usuario.id, { texto: "de outra" });
  t.after(() => AvaliacaoPersonal.destroy({ where: { id: criada.id } }));

  await assert.rejects(
    () => avaliacaoPersonalService.atualizar(equipe.id, aluno.id, criada.id, { texto: "invasão" }),
    /não encontrada/
  );
});

test("listar: mais recente primeiro", async (t) => {
  t.after(() => AvaliacaoPersonal.destroy({ where: { aluno_id: aluno.id } }));

  const a = await avaliacaoPersonalService.criar(equipe.id, aluno.id, usuario.id, { texto: "primeira" });
  await a.update({ created_at: new Date(Date.now() - 60000) });
  await avaliacaoPersonalService.criar(equipe.id, aluno.id, usuario.id, { texto: "segunda" });

  const lista = await avaliacaoPersonalService.listar(equipe.id, aluno.id);
  assert.deepEqual(
    lista.map((x) => x.texto),
    ["segunda", "primeira"]
  );
});
