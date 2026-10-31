"use strict";

// Catálogo global revisado (docs/adr/0027) - unitário, sem banco.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { REVISADOS, NOVOS } = require("./exercicios-globais-v2");
const { EXERCICIOS } = require("../seeders/20260826170000-seed-exercicios-globais");
const { idNovo } = require("../seeders/20261031120100-seed-exercicios-globais-v2");
const { normalizarTexto } = require("../../src/shared/utils/texto");

test("revisa exatamente os exercícios do catálogo original, cada um uma vez", () => {
  const originais = EXERCICIOS.map(([nome]) => nome).sort();
  const revisados = REVISADOS.map((r) => r.antigo).sort();
  assert.deepEqual(revisados, originais);
});

test("nenhum nome ou apelido, normalizado, aponta para dois exercícios", () => {
  const dono = new Map();
  const exercicios = [
    ...REVISADOS.map((r) => ({ chave: r.antigo, nome: r.nome || r.antigo, apelidos: r.apelidos })),
    ...NOVOS.map((n) => ({ chave: n.codigo, nome: n.nome, apelidos: n.apelidos }))
  ];
  const conflitos = [];
  for (const exercicio of exercicios) {
    const termos = new Set([exercicio.nome, ...exercicio.apelidos].map(normalizarTexto));
    for (const termo of termos) {
      if (dono.has(termo) && dono.get(termo) !== exercicio.chave) {
        conflitos.push(`"${termo}": ${dono.get(termo)} × ${exercicio.chave}`);
      }
      dono.set(termo, exercicio.chave);
    }
  }
  assert.deepEqual(conflitos, []);
});

test("apelido nunca repete o próprio nome nem se repete no mesmo exercício", () => {
  const todos = [
    ...REVISADOS.map((r) => ({ nome: r.nome || r.antigo, apelidos: r.apelidos })),
    ...NOVOS
  ];
  for (const { nome, apelidos } of todos) {
    const normalizados = apelidos.map(normalizarTexto);
    assert.ok(!normalizados.includes(normalizarTexto(nome)), `${nome}: apelido igual ao nome`);
    assert.equal(new Set(normalizados).size, normalizados.length, `${nome}: apelido repetido`);
  }
});

test("exercícios novos: códigos únicos, dificuldade válida e ids estáveis", () => {
  const codigos = NOVOS.map((n) => n.codigo);
  assert.equal(new Set(codigos).size, codigos.length);
  for (const novo of NOVOS) {
    assert.ok(["iniciante", "intermediario", "avancado"].includes(novo.dificuldade), novo.codigo);
  }
  assert.equal(idNovo("passada"), idNovo("passada"));
  assert.notEqual(idNovo("passada"), idNovo("supino-maquina"));
});
