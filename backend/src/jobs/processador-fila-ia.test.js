"use strict";

// montarContextoConsolidado e a funcao pura que monta o contexto enviado a
// IA (docs/adr/0006-provedor-ia-gemini.md) - precisa preservar a ordem
// original de captura (docs/adr/0002-conceito-de-registro.md) mesmo com
// texto e audio intercalados, e nunca quebrar quando uma transcricao ainda
// nao esta disponivel.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { montarContextoConsolidado } = require("./processador-fila-ia");

test("montarContextoConsolidado: preserva a ordem de captura, não a ordem de inserção", () => {
  const entradas = [
    { ordem: 1, tipo: "texto", conteudo_texto: "Segunda entrada." },
    { ordem: 0, tipo: "texto", conteudo_texto: "Primeira entrada." },
    { ordem: 2, tipo: "texto", conteudo_texto: "Terceira entrada." }
  ];

  const contexto = montarContextoConsolidado(entradas);
  const linhas = contexto.split("\n");
  assert.match(linhas[0], /Primeira entrada/);
  assert.match(linhas[1], /Segunda entrada/);
  assert.match(linhas[2], /Terceira entrada/);
});

test("montarContextoConsolidado: usa o texto transcrito de cada áudio", () => {
  const entradas = [
    {
      ordem: 0,
      tipo: "audio",
      arquivoAudio: { transcricao: { texto: "Agachamento quatro por dez." } }
    }
  ];
  const contexto = montarContextoConsolidado(entradas);
  assert.match(contexto, /Agachamento quatro por dez\./);
});

test("montarContextoConsolidado: entrada de áudio sem transcrição não quebra e fica marcada", () => {
  const entradas = [{ ordem: 0, tipo: "audio", arquivoAudio: { transcricao: null } }];
  const contexto = montarContextoConsolidado(entradas);
  assert.match(contexto, /transcrição indisponível/);
});

test("montarContextoConsolidado: mistura texto e áudio na ordem correta", () => {
  const entradas = [
    { ordem: 2, tipo: "texto", conteudo_texto: "Aumentar carga." },
    { ordem: 0, tipo: "audio", arquivoAudio: { transcricao: { texto: "Fez agachamento." } } },
    { ordem: 1, tipo: "audio", arquivoAudio: { transcricao: { texto: "Dificuldade na última série." } } }
  ];
  const contexto = montarContextoConsolidado(entradas);
  const linhas = contexto.split("\n");
  assert.match(linhas[0], /Fez agachamento/);
  assert.match(linhas[1], /Dificuldade na última série/);
  assert.match(linhas[2], /Aumentar carga/);
});
