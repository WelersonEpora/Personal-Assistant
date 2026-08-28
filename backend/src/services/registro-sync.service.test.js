"use strict";

// docs/adr/0005-estrategia-sincronizacao.md - validarMetadata e a primeira
// linha de defesa contra payload malformado antes de tocar o banco. Puro,
// sem banco (mesmo criterio do AgroMind para funcoes de validacao/parsing).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { validarMetadata } = require("./registro-sync.service");

function metadataValida(overrides = {}) {
  return {
    id: "registro-1",
    alunoId: "aluno-1",
    titulo: "",
    iniciadoEm: new Date().toISOString(),
    entradas: [
      { ordem: 0, tipo: "audio", duracaoSegundos: 10 },
      { ordem: 1, tipo: "texto", conteudoTexto: "Aumentar carga." }
    ],
    ...overrides
  };
}

test("validarMetadata: aceita metadata bem formado sem lançar", () => {
  assert.doesNotThrow(() => validarMetadata("registro-1", metadataValida()));
});

test("validarMetadata: rejeita quando o id do metadata não bate com o da URL", () => {
  assert.throws(() => validarMetadata("registro-1", metadataValida({ id: "outro-id" })), /id.*URL/);
});

test("validarMetadata: rejeita sem alunoId", () => {
  assert.throws(() => validarMetadata("registro-1", metadataValida({ alunoId: undefined })), /alunoId/);
});

test("validarMetadata: rejeita sem iniciadoEm", () => {
  assert.throws(() => validarMetadata("registro-1", metadataValida({ iniciadoEm: undefined })), /iniciadoEm/);
});

test("validarMetadata: rejeita Registro sem nenhuma entrada", () => {
  assert.throws(() => validarMetadata("registro-1", metadataValida({ entradas: [] })), /ao menos uma entrada/);
});

test("validarMetadata: rejeita tipo de entrada desconhecido", () => {
  assert.throws(
    () => validarMetadata("registro-1", metadataValida({ entradas: [{ ordem: 0, tipo: "video" }] })),
    /tipo/
  );
});

test("validarMetadata: rejeita entrada de texto sem conteudoTexto", () => {
  assert.throws(
    () => validarMetadata("registro-1", metadataValida({ entradas: [{ ordem: 0, tipo: "texto", conteudoTexto: "" }] })),
    /conteudoTexto/
  );
});

test("validarMetadata: rejeita ordem negativa ou não inteira", () => {
  assert.throws(
    () => validarMetadata("registro-1", metadataValida({ entradas: [{ ordem: -1, tipo: "audio" }] })),
    /ordem/
  );
});

test("validarMetadata: aceita tipo ausente (compat) e tipo válido", () => {
  assert.doesNotThrow(() => validarMetadata("registro-1", metadataValida({ tipo: undefined })));
  assert.doesNotThrow(() => validarMetadata("registro-1", metadataValida({ tipo: "avaliacao_fisica" })));
  assert.doesNotThrow(() => validarMetadata("registro-1", metadataValida({ tipo: "atendimento" })));
});

test("validarMetadata: rejeita tipo de Registro desconhecido", () => {
  assert.throws(() => validarMetadata("registro-1", metadataValida({ tipo: "ficha" })), /tipo/);
});
