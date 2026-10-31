"use strict";

// Ficha por voz (docs/adr/0028) - parte determinística, sem IA e sem banco.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { montarCatalogoParaPrompt, traduzirProposta, tipoDoGrupo } = require("./interpretacao");

const CATALOGO = [
  { id: "id-serrote", nome: "Serrote", grupo_muscular: "Costas", equipamento: "Halteres", ativo: true, apelidos: [{ apelido: "remada unilateral" }] },
  { id: "id-inativo", nome: "Exercício inativo", ativo: false, apelidos: [] },
  { id: "id-corda", nome: "Tríceps corda", grupo_muscular: "Tríceps", equipamento: "Polia (cabo)", ativo: true, apelidos: [] }
];

test("montarCatalogoParaPrompt: referência curta por exercício ativo, com apelidos; nunca o UUID", () => {
  const { texto, porRef } = montarCatalogoParaPrompt(CATALOGO);
  assert.equal(porRef.get("E1"), "id-serrote");
  assert.equal(porRef.get("E2"), "id-corda");
  assert.equal(porRef.size, 2, "inativo não entra");
  assert.match(texto, /^E1: Serrote \(Costas, Halteres\) — também chamado: remada unilateral$/m);
  assert.doesNotMatch(texto, /id-serrote/);
});

test("traduzirProposta: referência vira exercicio_id; referência inventada vira não reconhecido", () => {
  const { porRef } = montarCatalogoParaPrompt(CATALOGO);
  const { fichas } = traduzirProposta(
    {
      fichas: [
        {
          nome: " Treino A ",
          grupos: [
            { tipo: "simples", series: 4, itens: [{ exercicio_ref: "e1", repeticoes: "10", confianca: "alta" }] },
            { tipo: "simples", series: 3, itens: [{ exercicio_ref: "E99", nome_ouvido: "puxada no triângulo", confianca: "media" }] }
          ]
        }
      ]
    },
    porRef
  );
  assert.equal(fichas[0].nome, "Treino A");
  assert.equal(fichas[0].grupos[0].itens[0].exercicio_id, "id-serrote", "referência sem diferença de caixa");
  assert.equal(fichas[0].grupos[1].itens[0].exercicio_id, null);
  assert.equal(fichas[0].grupos[1].itens[0].nome_ouvido, "puxada no triângulo");
});

test("traduzirProposta: limpa séries, confiança e textos longos; descarta item e ficha vazios", () => {
  const { porRef } = montarCatalogoParaPrompt(CATALOGO);
  const { fichas, avisos } = traduzirProposta(
    {
      fichas: [
        {
          nome: "A",
          grupos: [
            {
              tipo: "simples",
              series: 2.5,
              descanso: "um minuto e meio entre as séries, sem pressa nenhuma",
              itens: [{ exercicio_ref: "E1", confianca: "certeza" }, { exercicio_ref: "", nome_ouvido: "" }]
            }
          ]
        },
        { nome: "Vazia", grupos: [{ itens: [] }] }
      ],
      avisos: [" não entendi a carga do supino ", ""]
    },
    porRef
  );
  assert.equal(fichas.length, 1, "ficha sem exercício é descartada");
  const grupo = fichas[0].grupos[0];
  assert.equal(grupo.series, null);
  assert.equal(grupo.descanso.length, 30);
  assert.equal(grupo.itens.length, 1, "item sem referência e sem nome ouvido é descartado");
  assert.equal(grupo.itens[0].confianca, "baixa");
  assert.deepEqual(avisos, ["não entendi a carga do supino"]);
});

test("tipoDoGrupo: a quantidade de exercícios manda quando o rótulo dito não bate", () => {
  assert.equal(tipoDoGrupo("biset", 1), "simples");
  assert.equal(tipoDoGrupo("biset", 2), "biset");
  assert.equal(tipoDoGrupo("biset", 3), "triset");
  assert.equal(tipoDoGrupo("simples", 2), "biset");
  assert.equal(tipoDoGrupo("circuito", 2), "circuito");
  assert.equal(tipoDoGrupo("triset", 5), "circuito");
});
