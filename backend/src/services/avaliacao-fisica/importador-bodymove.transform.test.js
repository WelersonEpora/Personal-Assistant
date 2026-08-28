"use strict";

// docs/adr/0016 (proposta v3 §8): transformação das linhas do BodyMove em
// estrutura normalizada. Unitário puro - sem banco, sem o .bak.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { transformarLegado } = require("./importador-bodymove");

// Monta `tabelas` mínimo a partir de overrides.
function tabelas({ cadastro, avaliacao, ...resto }) {
  const base = {
    cadastro: cadastro || [{ id: 1, nome: "Maria Souza", datanasc: "10/05/1990", sexo: "F" }],
    avaliacao: avaliacao || [{ id: 100, avaliado: 1, data: new Date("2024-03-10T00:00:00Z") }],
    antropometria: [],
    dobras: [],
    anamnese_base: [],
    postural: [],
    pollock_7dobras: [],
    durninwormersley_4dobras: [],
    petroski_4dobras: [],
    deurenberg_4dobras: [],
    faulkner_4dobras: [],
    slaughter_2dobras: [],
    composicao_direta: [],
    cardio_cooper12minutos: [],
    cardio_1600metros: [],
    cardio_2400metros: [],
    cardio_balke15minutos: [],
    cardio_subesteiellstad: []
  };
  return { ...base, ...resto };
}

function medidasDe(resultado) {
  return resultado.alunos[0].avaliacoes[0].medidas;
}

test("cadastro -> aluno: nome normalizado, data de nascimento e sexo", () => {
  const { alunos } = transformarLegado(tabelas({}));
  assert.equal(alunos.length, 1);
  assert.equal(alunos[0].nomeOriginal, "Maria Souza");
  assert.equal(alunos[0].nomeNormalizado, "maria souza");
  assert.equal(alunos[0].dataNascimento, "1990-05-10");
  assert.equal(alunos[0].sexo, "F");
});

test("antropometria: peso/altura/perímetros viram medidas 'direto'/'importado'; derivadas imc+rcq", () => {
  const res = transformarLegado(
    tabelas({
      antropometria: [{ avaliacao: 100, peso: 60, altura: 165, cintura: 70, quadril: 95, bd: 28, be: 27 }]
    })
  );
  const medidas = medidasDe(res);
  const porCodigo = Object.fromEntries(medidas.map((m) => [m.metrica_codigo, m]));

  assert.equal(porCodigo.peso.valor, 60);
  assert.equal(porCodigo.peso.metodo, "direto");
  assert.equal(porCodigo.peso.origem_valor, "importado");
  assert.equal(porCodigo.perimetro_braco_d.valor, 28);
  assert.equal(porCodigo.perimetro_braco_e.valor, 27);
  assert.equal(porCodigo.imc.origem_valor, "calculado");
  assert.equal(porCodigo.imc.valor, 22); // 60/1.65^2 = 22.03 -> 22.0
  assert.equal(porCodigo.rcq.valor, 0.74); // 70/95 = 0.7368 -> 0.74
});

test("valor 0 ou ausente não gera medida", () => {
  const res = transformarLegado(
    tabelas({ antropometria: [{ avaliacao: 100, peso: 70, altura: 0, cintura: null }] })
  );
  const codigos = medidasDe(res).map((m) => m.metrica_codigo);
  assert.ok(codigos.includes("peso"));
  assert.ok(!codigos.includes("altura"));
  assert.ok(!codigos.includes("perimetro_cintura"));
  assert.ok(!codigos.includes("imc")); // faltou altura
});

test("3 protocolos de % de gordura na mesma avaliação -> 3 linhas; principal = pollock_7", () => {
  const res = transformarLegado(
    tabelas({
      antropometria: [{ avaliacao: 100, peso: 56, altura: 160, padrao: "pollock" }],
      pollock_7dobras: [{ avaliacao: 100, gordura: 30.75 }],
      durninwormersley_4dobras: [{ avaliacao: 100, gordura: 38.1 }],
      petroski_4dobras: [{ avaliacao: 100, gordura: 33.23 }]
    })
  );
  const gordura = medidasDe(res).filter((m) => m.metrica_codigo === "percentual_gordura");
  assert.equal(gordura.length, 3);
  assert.deepEqual(
    gordura.map((g) => [g.metodo, g.principal]).sort(),
    [
      ["durnin_womersley", false],
      ["petroski", false],
      ["pollock_7", true]
    ]
  );
  assert.ok(gordura.every((g) => g.origem_valor === "calculado"));
});

test("sem pollock: principal cai para o próximo da precedência (durnin_womersley)", () => {
  const res = transformarLegado(
    tabelas({
      durninwormersley_4dobras: [{ avaliacao: 100, gordura: 28 }],
      petroski_4dobras: [{ avaliacao: 100, gordura: 31 }]
    })
  );
  const gordura = medidasDe(res).filter((m) => m.metrica_codigo === "percentual_gordura");
  const principal = gordura.find((g) => g.principal);
  assert.equal(principal.metodo, "durnin_womersley");
});

test("avaliação sem nenhum protocolo -> sem percentual_gordura", () => {
  const res = transformarLegado(tabelas({ antropometria: [{ avaliacao: 100, peso: 70, altura: 175 }] }));
  assert.ok(!medidasDe(res).some((m) => m.metrica_codigo === "percentual_gordura"));
});

test("composicao_direta -> percentual_gordura metodo 'informado'", () => {
  const res = transformarLegado(tabelas({ composicao_direta: [{ avaliacao: 100, gordura: 22, peso: 75 }] }));
  const g = medidasDe(res).find((m) => m.metrica_codigo === "percentual_gordura");
  assert.equal(g.metodo, "informado");
  assert.equal(g.principal, true);
});

test("VO2: cardio_cooper12minutos -> vo2max metodo cooper_12min", () => {
  const res = transformarLegado(tabelas({ cardio_cooper12minutos: [{ avaliacao: 100, vo2obtido: 33.4 }] }));
  const vo2 = medidasDe(res).find((m) => m.metrica_codigo === "vo2max");
  assert.equal(vo2.metodo, "cooper_12min");
  assert.equal(vo2.valor, 33.4);
});

test("anamnese.obs 'PA 110/80 - FC 63' -> medidas pas/pad/fc de repouso", () => {
  const res = transformarLegado(
    tabelas({ anamnese_base: [{ avaliacao: 100, obs: "PA 110/80 - FC 63" }] })
  );
  const porCodigo = Object.fromEntries(medidasDe(res).map((m) => [m.metrica_codigo, m.valor]));
  assert.equal(porCodigo.pas_repouso, 110);
  assert.equal(porCodigo.pad_repouso, 80);
  assert.equal(porCodigo.fc_repouso, 63);
});

test("anamnese.obs sem PA/FC reconhecível -> nenhuma medida + aviso", () => {
  const res = transformarLegado(tabelas({ anamnese_base: [{ avaliacao: 100, obs: "PA" }] }));
  assert.ok(!medidasDe(res).some((m) => ["pas_repouso", "pad_repouso", "fc_repouso"].includes(m.metrica_codigo)));
  assert.ok(res.avisos.some((a) => a.includes("sem PA/FC")));
});

test("anamnese_json: campos negativos ('Não.') são omitidos", () => {
  const res = transformarLegado(
    tabelas({
      anamnese_base: [
        {
          avaliacao: 100,
          metaoutra: "Emagrecimento",
          atividade: true,
          atividadetipo: "Musculação",
          atividadefreq: "3",
          medicamentos: "Não.",
          dores: "Não.",
          restricoes: "Losartana"
        }
      ]
    })
  );
  const j = res.alunos[0].avaliacoes[0].anamneseJson;
  assert.equal(j.objetivo, "Emagrecimento");
  assert.equal(j.pratica_atividade, true);
  assert.equal(j.atividade_frequencia_semanal, 3);
  assert.equal(j.restricoes, "Losartana");
  assert.ok(!("medicamentos" in j));
  assert.ok(!("dores_queixas" in j));
});

test("postural_json: colunas legadas mapeadas para o esquema fechado por região", () => {
  const res = transformarLegado(
    tabelas({
      postural: [
        {
          avaliacao: 100,
          hiperlordosecervical: true,
          protacaoescapular: true,
          genuflexod: true,
          planoe: true,
          abdutod: true // sem lugar no esquema v3
        }
      ]
    })
  );
  const j = res.alunos[0].avaliacoes[0].posturalJson;
  assert.equal(j.coluna.hiperlordose_cervical, true);
  assert.equal(j.ombros_escapulas.protracao_escapular, true);
  assert.equal(j.joelho.direito.flexo, true);
  assert.equal(j.joelho.esquerdo.flexo, false);
  assert.equal(j.pe.esquerdo.plano, true);
  assert.equal(j.pe.direito.plano, false);
  assert.ok(res.avisos.some((a) => a.includes("abdutod")));
});

test("aluno sem nenhuma avaliação válida não entra no resultado", () => {
  const res = transformarLegado(
    tabelas({ avaliacao: [{ id: 100, avaliado: 1, data: null }] })
  );
  assert.equal(res.alunos.length, 0);
  assert.ok(res.avisos.some((a) => a.includes("data")));
});

test("dobras: só os 9 valores consolidados viram medida (parciais descartadas)", () => {
  const res = transformarLegado(
    tabelas({
      dobras: [{ avaliacao: 100, tricipital: 12, tricipital1: "12,00", tricipital2: "13,00", coxa: 20 }]
    })
  );
  const codigos = medidasDe(res).map((m) => m.metrica_codigo);
  assert.ok(codigos.includes("dobra_tricipital"));
  assert.ok(codigos.includes("dobra_coxa"));
  assert.equal(medidasDe(res).find((m) => m.metrica_codigo === "dobra_tricipital").valor, 12);
});
