"use strict";

// docs/adr/0005-estrategia-sincronizacao.md - validarMetadata e a primeira
// linha de defesa contra payload malformado antes de tocar o banco. Puro,
// sem banco (mesmo criterio do AgroMind para funcoes de validacao/parsing).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { validarMetadata, resolverDataAtendimento } = require("./registro-sync.service");

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

// docs/adr/0019 - data do atendimento (separada da data de captura)
const INICIO = "2026-08-20T14:00:00.000Z";

test("resolverDataAtendimento: ausente -> deriva de iniciadoEm::date (compat)", () => {
  assert.equal(resolverDataAtendimento(INICIO, undefined), "2026-08-20");
  assert.equal(resolverDataAtendimento(INICIO, ""), "2026-08-20");
});

test("resolverDataAtendimento: aceita o próprio dia e até 7 dias antes", () => {
  assert.equal(resolverDataAtendimento(INICIO, "2026-08-20"), "2026-08-20");
  assert.equal(resolverDataAtendimento(INICIO, "2026-08-13"), "2026-08-13");
});

test("resolverDataAtendimento: rejeita data futura (depois do início da captura)", () => {
  assert.throws(() => resolverDataAtendimento(INICIO, "2026-08-21"), /entre .* e 2026-08-20/);
});

test("resolverDataAtendimento: rejeita mais de 7 dias antes (é caso de desktop)", () => {
  assert.throws(() => resolverDataAtendimento(INICIO, "2026-08-12"), /desktop/);
});

test("resolverDataAtendimento: rejeita formato inválido", () => {
  assert.throws(() => resolverDataAtendimento(INICIO, "20/08/2026"), /AAAA-MM-DD/);
  assert.throws(() => resolverDataAtendimento(INICIO, "2026-13-01"), /inválida/);
});

test("validarMetadata: propaga erro de dataAtendimento fora da janela", () => {
  assert.throws(
    () => validarMetadata("registro-1", metadataValida({ iniciadoEm: INICIO, dataAtendimento: "2026-07-01" })),
    /desktop/
  );
});
