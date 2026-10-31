"use strict";

// docs/adr/0025: bloco de avaliação física do prompt do Acompanhamento
// Mensal. Puro - sem banco.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { montarBlocoAvaliacaoFisica } = require("./bloco-avaliacao-fisica");

const METRICA = {
  peso: { rotulo: "Peso corporal", unidade: "kg", casas_decimais: 1 },
  percentual_gordura: { rotulo: "% de gordura", unidade: "%", casas_decimais: 1 },
  massa_gorda: { rotulo: "Massa gorda", unidade: "kg", casas_decimais: 1 },
  massa_magra: { rotulo: "Massa magra (livre de gordura)", unidade: "kg", casas_decimais: 1 },
  rcq: { rotulo: "Relação cintura-quadril", unidade: "adimensional", casas_decimais: 2 },
  perimetro_cintura: { rotulo: "Perímetro da cintura", unidade: "cm", casas_decimais: 1 },
  dobra_tricipital: { rotulo: "Dobra tricipital", unidade: "mm", casas_decimais: 1 },
  pas_repouso: { rotulo: "Pressão sistólica (repouso)", unidade: "mmHg", casas_decimais: 0 },
  pad_repouso: { rotulo: "Pressão diastólica (repouso)", unidade: "mmHg", casas_decimais: 0 }
};

function medida(codigo, valor, metodo = "direto", principal = true) {
  // valor como string, como o DECIMAL chega do Postgres
  return { metrica_codigo: codigo, valor: String(valor), metodo, principal, metrica: METRICA[codigo] };
}

function avaliacao(id, data, medidas) {
  return { id, data, medidas };
}

test("mês sem avaliação: uma linha com a última e há quantos dias", () => {
  const bloco = montarBlocoAvaliacaoFisica({
    doMes: [],
    anterior: avaliacao("a0", "2026-09-06", []),
    fimData: "2026-10-31"
  });
  assert.match(bloco, /AVALIAÇÃO FÍSICA DO MÊS/);
  assert.match(bloco, /Nenhuma avaliação física neste mês\. Última: 06\/09\/2026 \(há 55 dias no fim do mês\)\./);
});

test("aluno sem nenhuma avaliação", () => {
  const bloco = montarBlocoAvaliacaoFisica({ doMes: [], anterior: null, fimData: "2026-10-31" });
  assert.match(bloco, /Nenhuma avaliação física registrada para este aluno\./);
});

test("diferenças calculadas pelo código, com sinal, unidade e p.p. na % de gordura", () => {
  const anterior = avaliacao("a0", "2026-09-06", [
    medida("peso", 70),
    medida("percentual_gordura", 28.3, "pollock_7"),
    medida("perimetro_cintura", 78),
    medida("rcq", 0.8)
  ]);
  const atual = avaliacao("a1", "2026-10-18", [
    medida("peso", 68.4),
    medida("percentual_gordura", 27.1, "pollock_7"),
    medida("perimetro_cintura", 78),
    medida("rcq", 0.78)
  ]);
  const bloco = montarBlocoAvaliacaoFisica({ doMes: [atual], anterior, fimData: "2026-10-31" });

  assert.match(bloco, /\[avaliacao_fisica:a1 \| em 2026-10-18 \| anterior: 2026-09-06, 42 dias antes\]/);
  assert.match(bloco, /- Peso corporal: 68,4 kg \(−1,6 kg\)/);
  assert.match(bloco, /- % de gordura \(Pollock 7 dobras\): 27,1 % \(−1,2 p\.p\.\)/);
  assert.match(bloco, /- Perímetro da cintura: 78,0 cm \(sem variação\)/);
  assert.match(bloco, /- Relação cintura-quadril: 0,78 \(−0,02\)/); // adimensional: sem unidade
});

test("método diferente: não calcula diferença e avisa para não comparar (massas herdam o método da %)", () => {
  const anterior = avaliacao("a0", "2026-09-06", [
    medida("percentual_gordura", 27.1, "pollock_7"),
    medida("massa_gorda", 19)
  ]);
  const atual = avaliacao("a1", "2026-10-18", [
    medida("percentual_gordura", 24.8, "bioimpedancia"),
    medida("massa_gorda", 17)
  ]);
  const bloco = montarBlocoAvaliacaoFisica({ doMes: [atual], anterior, fimData: "2026-10-31" });

  assert.match(bloco, /% de gordura \(Bioimpedância\): 24,8 % — método diferente da anterior \(Pollock 7 dobras: 27,1 %\), não comparar/);
  assert.match(bloco, /Massa gorda \(Bioimpedância\): 17,0 kg — método diferente da anterior/);
  assert.doesNotMatch(bloco, /p\.p\./);
});

test("só a medida principal entra; dobras e métricas fora da lista ficam de fora", () => {
  const atual = avaliacao("a1", "2026-10-18", [
    medida("percentual_gordura", 27.1, "pollock_7"),
    medida("percentual_gordura", 30, "petroski", false),
    medida("dobra_tricipital", 18)
  ]);
  const bloco = montarBlocoAvaliacaoFisica({ doMes: [atual], anterior: null, fimData: "2026-10-31" });

  assert.match(bloco, /primeira avaliação registrada/);
  assert.match(bloco, /27,1 %/);
  assert.doesNotMatch(bloco, /30,0/);
  assert.doesNotMatch(bloco, /Dobra/);
});

test("PA de repouso numa linha só, com a anterior para referência", () => {
  const anterior = avaliacao("a0", "2026-09-06", [medida("pas_repouso", 130), medida("pad_repouso", 85)]);
  const atual = avaliacao("a1", "2026-10-18", [medida("pas_repouso", 120), medida("pad_repouso", 80)]);
  const bloco = montarBlocoAvaliacaoFisica({ doMes: [atual], anterior, fimData: "2026-10-31" });
  assert.match(bloco, /- PA de repouso: 120\/80 mmHg \(anterior: 130\/85\)/);
});

test("duas avaliações no mês: em ordem de data, a segunda compara com a primeira", () => {
  const primeira = avaliacao("a1", "2026-10-02", [medida("peso", 70)]);
  const segunda = avaliacao("a2", "2026-10-28", [medida("peso", 69)]);
  const bloco = montarBlocoAvaliacaoFisica({ doMes: [segunda, primeira], anterior: null, fimData: "2026-10-31" });

  assert.ok(bloco.indexOf("avaliacao_fisica:a1") < bloco.indexOf("avaliacao_fisica:a2"));
  assert.match(bloco, /\[avaliacao_fisica:a2 \| em 2026-10-28 \| anterior: 2026-10-02, 26 dias antes\]\n {2}- Peso corporal: 69,0 kg \(−1,0 kg\)/);
});

test("avaliação sem nenhuma das métricas acompanhadas não fica com seção vazia", () => {
  const atual = avaliacao("a1", "2026-10-18", [medida("dobra_tricipital", 18)]);
  const bloco = montarBlocoAvaliacaoFisica({ doMes: [atual], anterior: null, fimData: "2026-10-31" });
  assert.match(bloco, /nenhuma das medidas acompanhadas foi registrada/);
});
