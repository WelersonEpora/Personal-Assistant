"use strict";

// docs/adr/0016 (proposta v3 §5): esquema fechado de anamnese/postural -
// chave desconhecida é rejeitada. Unitário puro.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { validarAnamneseJson, validarPosturalJson } = require("./esquemas");

test("anamnese: null / {} são válidos e viram null", () => {
  assert.equal(validarAnamneseJson(null), null);
  assert.equal(validarAnamneseJson({}), null);
  assert.equal(validarAnamneseJson({ objetivo: "  " }), null); // vazio -> descartado
});

test("anamnese: normaliza (trim) e descarta chave vazia", () => {
  const j = validarAnamneseJson({ objetivo: "  Hipertrofia ", restricoes: "" });
  assert.deepEqual(j, { objetivo: "Hipertrofia" });
});

test("anamnese: tabagismo é sub-objeto com chaves fixas", () => {
  const j = validarAnamneseJson({ tabagismo: { fuma: true, cigarros_dia: 10, tempo: "5 anos" } });
  assert.deepEqual(j.tabagismo, { fuma: true, cigarros_dia: 10, tempo: "5 anos" });
  assert.throws(() => validarAnamneseJson({ tabagismo: { fumante: true } }), /chave desconhecida/);
});

test("anamnese: historico_familiar precisa ser lista de textos", () => {
  assert.deepEqual(validarAnamneseJson({ historico_familiar: ["diabetes", " hipertensao "] }).historico_familiar, [
    "diabetes",
    "hipertensao"
  ]);
  assert.throws(() => validarAnamneseJson({ historico_familiar: "diabetes" }), /lista de textos/);
});

test("anamnese: chave desconhecida -> erro", () => {
  assert.throws(() => validarAnamneseJson({ peso: 80 }), /chave desconhecida "peso"/);
});

test("anamnese: tipo errado -> erro", () => {
  assert.throws(() => validarAnamneseJson({ pratica_atividade: "sim" }), /booleano/);
  assert.throws(() => validarAnamneseJson({ atividade_frequencia_semanal: 3.5 }), /inteiro/);
});

test("postural: estrutura aninhada por região é aceita e normalizada", () => {
  const j = validarPosturalJson({
    coluna: { escoliose: true, hipercifose: false },
    joelho: { direito: { valgo: true }, esquerdo: {} },
    pe: { direito: { plano: true } },
    observacoes: "  encaminhado ao fisio  "
  });
  assert.deepEqual(j.coluna, { escoliose: true, hipercifose: false });
  assert.deepEqual(j.joelho, { direito: { valgo: true } });
  assert.equal(j.observacoes, "encaminhado ao fisio");
});

test("postural: região/lado/achado desconhecido -> erro", () => {
  assert.throws(() => validarPosturalJson({ pescoco: {} }), /região desconhecida/);
  assert.throws(() => validarPosturalJson({ joelho: { centro: {} } }), /lado desconhecido/);
  assert.throws(() => validarPosturalJson({ coluna: { foo: true } }), /chave desconhecida/);
});

test("postural: achado com valor não-booleano -> erro", () => {
  assert.throws(() => validarPosturalJson({ coluna: { escoliose: "sim" } }), /booleano/);
});

test("postural: null / vazio -> null", () => {
  assert.equal(validarPosturalJson(null), null);
  assert.equal(validarPosturalJson({ coluna: {} }), null);
});
