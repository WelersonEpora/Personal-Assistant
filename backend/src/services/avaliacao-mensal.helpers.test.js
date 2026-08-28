"use strict";

// docs/adr/0015: funções puras do acompanhamento mensal - cálculo do mês de
// referência e montagem do prompt (contexto anterior + relatos do mês, sem
// histórico antigo). Sem banco.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { mesReferenciaAnterior, limitesMes, montarPromptAvaliacao } = require("./avaliacao-mensal.service");

test("mesReferenciaAnterior: retorna o mês anterior em YYYY-MM", () => {
  assert.equal(mesReferenciaAnterior(new Date(2026, 7, 3)), "2026-07");
  assert.equal(mesReferenciaAnterior(new Date(2026, 0, 15)), "2025-12");
});

test("limitesMes: janela [inicio, fim) e datas do período", () => {
  const limites = limitesMes("2026-02");
  assert.equal(limites.inicioData, "2026-02-01");
  assert.equal(limites.fimData, "2026-02-28");
  assert.equal(limites.inicio.getMonth(), 1);
  assert.equal(limites.fim.getMonth(), 2);
});

test("montarPromptAvaliacao: primeiro ciclo deixa claro que não há contexto anterior", () => {
  const prompt = montarPromptAvaliacao({ alunoId: "aluno-1", anoMes: "2026-03", contextoAnterior: null, relatos: [] });
  assert.match(prompt, /primeiro ciclo/);
  assert.match(prompt, /MÊS DE REFERÊNCIA: 2026-03/);
});

test("montarPromptAvaliacao: inclui os itens confirmados de cada relato e a rastreabilidade pelo id", () => {
  const relatos = [
    {
      id: "rel-1",
      iniciado_em: new Date(2026, 2, 10),
      validacao: {
        confirmado_em: new Date(2026, 2, 12),
        payload_confirmado_json: { itens: [{ label: "Supino", valor: "4x8 40kg", obs: "boa execução" }], notaGeral: "aluno motivado" }
      }
    }
  ];
  const prompt = montarPromptAvaliacao({ alunoId: "aluno-1", anoMes: "2026-03", contextoAnterior: { linha_de_base: [] }, relatos });
  assert.match(prompt, /relato:rel-1/);
  assert.match(prompt, /Supino: 4x8 40kg \(obs: boa execução\)/);
  assert.match(prompt, /nota geral: aluno motivado/);
});

test("montarPromptAvaliacao: usa data_atendimento como 'sessão em' (docs/adr/0019)", () => {
  const relatos = [
    {
      id: "rel-1",
      // captura no dia 12, mas o atendimento foi no dia 8
      iniciado_em: new Date(2026, 2, 12),
      data_atendimento: "2026-03-08",
      validacao: {
        confirmado_em: new Date(2026, 2, 12),
        payload_confirmado_json: { itens: [], notaGeral: "" }
      }
    }
  ];
  const prompt = montarPromptAvaliacao({ alunoId: "aluno-1", anoMes: "2026-03", contextoAnterior: null, relatos });
  assert.match(prompt, /sessão em 2026-03-08/);
});
