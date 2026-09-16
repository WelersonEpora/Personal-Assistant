"use strict";

// Retry de erro transitório do Gemini (docs/adr/0006). Não chama a API real -
// testa só a política: o que é transitório e o comportamento de re-tentativa.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  comRetry,
  ehTransitorio,
  montarCatalogoParaPrompt,
  montarPromptRadar,
  extrairPrimeiroArrayJson,
  PERSONA_PERSONAL_SENIOR,
  INSTRUCAO_AVALIACAO_MENSAL,
  INSTRUCAO_ANALISE_SOB_DEMANDA,
  SCHEMA_AVALIACAO_MENSAL,
  SCHEMA_ANALISE_SOB_DEMANDA
} = require("./gemini.service");

test("ehTransitorio: reconhece 503/429/500 e mensagens de sobrecarga", () => {
  assert.equal(ehTransitorio({ status: 503 }), true);
  assert.equal(ehTransitorio({ code: 429 }), true);
  assert.equal(ehTransitorio({ status: 500 }), true);
  assert.equal(ehTransitorio({ message: 'This model is currently experiencing high demand. "status":"UNAVAILABLE"' }), true);
  assert.equal(ehTransitorio({ message: "The model is overloaded. Please try again later." }), true);
});

test("ehTransitorio: NÃO retenta erro de cliente/config/schema", () => {
  assert.equal(ehTransitorio({ status: 400, message: "Invalid JSON schema" }), false);
  assert.equal(ehTransitorio({ status: 401, message: "API key not valid" }), false);
  assert.equal(ehTransitorio({ message: "responseSchema is invalid" }), false);
  assert.equal(ehTransitorio(new Error("boom")), false);
});

test("comRetry: erro transitório é retentado e a chamada seguinte pode ter sucesso", async () => {
  let chamadas = 0;
  const resultado = await comRetry(
    async () => {
      chamadas += 1;
      if (chamadas < 3) {
        const err = new Error("high demand");
        err.status = 503;
        throw err;
      }
      return "ok";
    },
    { esperaBaseMs: 1 }
  );

  assert.equal(resultado, "ok");
  assert.equal(chamadas, 3);
});

test("comRetry: erro NÃO transitório falha na primeira tentativa", async () => {
  let chamadas = 0;
  await assert.rejects(
    () =>
      comRetry(
        async () => {
          chamadas += 1;
          const err = new Error("Invalid schema");
          err.status = 400;
          throw err;
        },
        { esperaBaseMs: 1 }
      ),
    /Invalid schema/
  );
  assert.equal(chamadas, 1);
});

test("montarCatalogoParaPrompt: uma linha por métrica ativa, com código e unidade canônica", () => {
  const catalogo = [
    { codigo: "peso", rotulo: "Peso corporal", categoria: "antropometria", unidade: "kg", casas_decimais: 1, ativo: true },
    { codigo: "dobra_tricipital", rotulo: "Dobra tricipital", categoria: "dobra", unidade: "mm", casas_decimais: 1, ativo: true },
    { codigo: "metrica_desativada", rotulo: "X", categoria: "y", unidade: "cm", casas_decimais: 0, ativo: false }
  ];
  const texto = montarCatalogoParaPrompt(catalogo);
  const linhas = texto.split("\n");
  assert.equal(linhas.length, 2, "métrica inativa não entra no prompt");
  assert.match(linhas[0], /^- peso · Peso corporal · antropometria · unidade canônica: kg/);
  assert.match(texto, /dobra_tricipital/);
  assert.doesNotMatch(texto, /metrica_desativada/);
});

// docs/adr/0022 - Radar. Sem responseSchema (incompatível com googleSearch):
// o parse do array JSON precisa tolerar bloco cercado e texto em volta.
test("extrairPrimeiroArrayJson: array puro, bloco ```json e texto em volta", () => {
  assert.deepEqual(extrairPrimeiroArrayJson('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(
    extrairPrimeiroArrayJson('Segue o resultado:\n```json\n[{"titulo":"X"}]\n```\nEspero ter ajudado.'),
    [{ titulo: "X" }]
  );
  assert.deepEqual(extrairPrimeiroArrayJson('Aqui está: [1, 2, 3] pronto.'), [1, 2, 3]);
});

test("extrairPrimeiroArrayJson: lixo / sem array -> null", () => {
  assert.equal(extrairPrimeiroArrayJson("não achei nada relevante"), null);
  assert.equal(extrairPrimeiroArrayJson(""), null);
  assert.equal(extrairPrimeiroArrayJson(null), null);
  assert.equal(extrairPrimeiroArrayJson("resposta [truncada"), null);
});

test("montarPromptRadar: inclui janela, fontes permitidas, assuntos, teto e foco", () => {
  const prompt = montarPromptRadar({
    assuntos: ["treino de força"],
    fontes: [{ nome: "BJSM", dominio: "bjsm.bmj.com" }],
    janela: { de: "2026-08-03", ate: "2026-09-02" },
    criterios: ["priorize revisão sistemática"],
    maxItens: 4,
    foco: "Treino de força e prescrição"
  });
  assert.match(prompt, /2026-08-03 a 2026-09-02/);
  assert.match(prompt, /BJSM \(bjsm\.bmj\.com\)/);
  assert.match(prompt, /treino de força/);
  assert.match(prompt, /FOCO DESTA BUSCA: Treino de força e prescrição/);
  assert.match(prompt, /até o limite de 4/);
  assert.doesNotMatch(prompt, /NÃO devolva nenhuma destas/); // sem lista => sem o bloco
});

test("montarPromptRadar: sem foco não injeta a linha FOCO", () => {
  const prompt = montarPromptRadar({
    assuntos: ["x"],
    fontes: [{ nome: "BJSM", dominio: "bjsm.bmj.com" }],
    janela: { de: "2026-08-03", ate: "2026-09-02" },
    criterios: ["c"],
    maxItens: 4
  });
  assert.doesNotMatch(prompt, /FOCO DESTA BUSCA/);
});

test("montarPromptRadar: com jaPublicados, injeta a lista 'já no Radar' para o modelo não repetir", () => {
  const prompt = montarPromptRadar({
    assuntos: ["x"],
    fontes: [{ nome: "BJSM", dominio: "bjsm.bmj.com" }],
    janela: { de: "2026-08-26", ate: "2026-09-02" },
    criterios: ["c"],
    maxItens: 4,
    jaPublicados: [{ titulo: "Revisão sobre imersão em água fria", url: "https://doi.org/10.1/x" }]
  });
  assert.match(prompt, /NÃO devolva nenhuma destas/);
  assert.match(prompt, /Revisão sobre imersão em água fria \(https:\/\/doi\.org\/10\.1\/x\)/);
});

// Acompanhamento de IA (docs/adr/0015) - guardas de segurança sobre dor/
// diagnóstico e faltas/ausências, e o schema que as reforça estruturalmente
// (não só em prosa, que o modelo pode "esquecer").

test("persona: proíbe diagnóstico/tratamento e orienta encaminhamento profissional", () => {
  assert.match(PERSONA_PERSONAL_SENIOR, /NÃO é médico/);
  assert.match(PERSONA_PERSONAL_SENIOR, /NUNCA como fato ou diagnóstico fechado/);
  assert.match(PERSONA_PERSONAL_SENIOR, /NUNCA prescrevendo tratamento/);
  assert.match(PERSONA_PERSONAL_SENIOR, /profissional de saúde/);
});

test("avaliação mensal: instrui tipo obrigatório, dor sem regra rígida de contagem e faltas sem inferir de silêncio", () => {
  assert.match(INSTRUCAO_AVALIACAO_MENSAL, /preencha "tipo"/);
  assert.match(INSTRUCAO_AVALIACAO_MENSAL, /Não crie uma regra rígida de contagem/);
  assert.match(INSTRUCAO_AVALIACAO_MENSAL, /NUNCA conclua ou insinue que o aluno faltou apenas porque não há relato/);
  assert.match(INSTRUCAO_AVALIACAO_MENSAL, /responsabilidade de outra parte do sistema/);
});

test("análise sob demanda: mesmas guardas de dor e faltas da avaliação mensal", () => {
  assert.match(INSTRUCAO_ANALISE_SOB_DEMANDA, /preencha "tipo"/);
  assert.match(INSTRUCAO_ANALISE_SOB_DEMANDA, /NUNCA conclua ou insinue em "alertas" que o aluno faltou/);
});

test("schema mensal: dimensoes e alertas exigem 'tipo' (fato/interpretacao/hipotese)", () => {
  const dimensao = SCHEMA_AVALIACAO_MENSAL.properties.avaliacao_mensal.properties.dimensoes.items;
  const alerta = SCHEMA_AVALIACAO_MENSAL.properties.avaliacao_mensal.properties.alertas.items;
  assert.ok(dimensao.required.includes("tipo"));
  assert.deepEqual(dimensao.properties.tipo.enum, ["fato", "interpretacao", "hipotese"]);
  assert.ok(alerta.required.includes("tipo"));
  assert.deepEqual(alerta.properties.tipo.enum, ["fato", "interpretacao", "hipotese"]);
});

test("schema mensal: gravidade do alerta não reaproveita o enum de confiança", () => {
  const alerta = SCHEMA_AVALIACAO_MENSAL.properties.avaliacao_mensal.properties.alertas.items;
  const dimensao = SCHEMA_AVALIACAO_MENSAL.properties.avaliacao_mensal.properties.dimensoes.items;
  assert.notEqual(alerta.properties.gravidade, dimensao.properties.confianca, "gravidade deve ser um enum próprio, não o mesmo objeto de NIVEL_CONFIANCA");
  assert.deepEqual(alerta.properties.gravidade.enum, ["alta", "media", "baixa"]);
});

test("schema de análise sob demanda: mesmas garantias estruturais da avaliação mensal", () => {
  const dimensao = SCHEMA_ANALISE_SOB_DEMANDA.properties.analise.properties.dimensoes.items;
  const alerta = SCHEMA_ANALISE_SOB_DEMANDA.properties.analise.properties.alertas.items;
  assert.ok(dimensao.required.includes("tipo"));
  assert.ok(alerta.required.includes("tipo"));
  assert.notEqual(alerta.properties.gravidade, dimensao.properties.confianca);
});

test("comRetry: transitório persistente estoura após o máximo de tentativas", async () => {
  let chamadas = 0;
  await assert.rejects(
    () =>
      comRetry(
        async () => {
          chamadas += 1;
          const err = new Error("overloaded");
          err.status = 503;
          throw err;
        },
        { tentativas: 3, esperaBaseMs: 1 }
      ),
    /overloaded/
  );
  assert.equal(chamadas, 3);
});
