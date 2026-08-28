"use strict";

// docs/adr/0016: persistência do importador do BodyMove. Integração - toca o
// banco de teste (depende do seed do catálogo de métricas). Verifica
// idempotência, relacionamentos, "vincular e completar" e as constraints.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const models = require("../../models");
const { Equipe, Aluno, AvaliacaoFisica, AvaliacaoFisicaMedida, MetricaAvaliacaoFisica } = models;
const { persistir } = require("./importador-bodymove");

let equipe;
let outraEquipe;

// Uma estrutura normalizada (saída de transformarLegado) enxuta e determinística.
function amostra() {
  return {
    alunos: [
      {
        cadastroLegadoId: 1,
        nomeOriginal: "Fábio Silva",
        nomeNormalizado: "fabio silva",
        dataNascimento: "1980-08-13",
        sexo: "M",
        avaliacoes: [
          {
            dataISO: "2010-04-05",
            anamneseJson: { objetivo: "Condicionamento" },
            posturalJson: null,
            observacoes: null,
            medidas: [
              { metrica_codigo: "peso", metodo: "direto", principal: true, valor: 63.2, origem_valor: "importado" },
              { metrica_codigo: "altura", metodo: "direto", principal: true, valor: 164, origem_valor: "importado" },
              { metrica_codigo: "percentual_gordura", metodo: "pollock_7", principal: true, valor: 17.7, origem_valor: "calculado" },
              { metrica_codigo: "percentual_gordura", metodo: "durnin_womersley", principal: false, valor: 21.4, origem_valor: "calculado" },
              { metrica_codigo: "imc", metodo: "direto", principal: true, valor: 23.5, origem_valor: "calculado" }
            ]
          },
          {
            dataISO: "2011-06-01",
            anamneseJson: null,
            posturalJson: null,
            observacoes: null,
            medidas: [
              { metrica_codigo: "peso", metodo: "direto", principal: true, valor: 65, origem_valor: "importado" }
            ]
          }
        ]
      }
    ]
  };
}

before(async () => {
  equipe = await Equipe.create({ nome: `Import ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });

  // O catálogo de métricas precisa estar seedado (CI roda db:seed antes).
  const total = await MetricaAvaliacaoFisica.count();
  assert.ok(total >= 38, `catálogo de métricas não seedado (count=${total})`);
});

after(async () => {
  const alunos = await Aluno.findAll({ where: { equipe_id: [equipe.id, outraEquipe.id] }, attributes: ["id"] });
  const ids = alunos.map((a) => a.id);
  if (ids.length) {
    const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: ids }, attributes: ["id"] });
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
    await AvaliacaoFisica.destroy({ where: { aluno_id: ids } });
    await Aluno.destroy({ where: { id: ids } });
  }
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
});

test("cria aluno (com data_nascimento/sexo), avaliações e medidas; relacionamentos navegáveis", async (t) => {
  t.after(async () => {
    const alunos = await Aluno.findAll({ where: { equipe_id: equipe.id }, attributes: ["id"] });
    const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: alunos.map((a) => a.id) }, attributes: ["id"] });
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
    await AvaliacaoFisica.destroy({ where: { aluno_id: alunos.map((a) => a.id) } });
    await Aluno.destroy({ where: { id: alunos.map((a) => a.id) } });
  });

  const relatorio = await persistir(amostra(), { equipeId: equipe.id, models });

  assert.equal(relatorio.alunosCriados, 1);
  assert.equal(relatorio.avaliacoesCriadas, 2);
  assert.equal(relatorio.avaliacoesJaExistentes, 0);
  assert.equal(relatorio.medidasCriadas, 6);

  const aluno = await Aluno.findOne({
    where: { equipe_id: equipe.id, nome: "Fábio Silva" },
    include: [{ model: AvaliacaoFisica, as: "avaliacoesFisicas", include: [{ model: AvaliacaoFisicaMedida, as: "medidas", include: [{ model: MetricaAvaliacaoFisica, as: "metrica" }] }] }]
  });

  assert.equal(aluno.data_nascimento, "1980-08-13");
  assert.equal(aluno.sexo, "M");
  assert.equal(aluno.avaliacoesFisicas.length, 2);

  const primeira = aluno.avaliacoesFisicas.find((a) => a.data === "2010-04-05");
  assert.equal(primeira.origem, "legado_bodymove");
  assert.equal(primeira.equipe_id, equipe.id);
  assert.equal(primeira.avaliador_id, null);
  assert.deepEqual(primeira.anamnese_json, { objetivo: "Condicionamento" });
  assert.equal(primeira.medidas.length, 5);

  const peso = primeira.medidas.find((m) => m.metrica_codigo === "peso");
  assert.equal(Number(peso.valor), 63.2);
  assert.equal(peso.metrica.unidade, "kg"); // join no catálogo
});

test("idempotência: rodar 2x não duplica nada", async (t) => {
  t.after(async () => {
    const alunos = await Aluno.findAll({ where: { equipe_id: equipe.id }, attributes: ["id"] });
    const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: alunos.map((a) => a.id) }, attributes: ["id"] });
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
    await AvaliacaoFisica.destroy({ where: { aluno_id: alunos.map((a) => a.id) } });
    await Aluno.destroy({ where: { id: alunos.map((a) => a.id) } });
  });

  await persistir(amostra(), { equipeId: equipe.id, models });
  const relatorio2 = await persistir(amostra(), { equipeId: equipe.id, models });

  assert.equal(relatorio2.alunosCriados, 0);
  assert.equal(relatorio2.alunosVinculados, 1);
  assert.equal(relatorio2.avaliacoesCriadas, 0);
  assert.equal(relatorio2.avaliacoesJaExistentes, 2);
  assert.equal(relatorio2.medidasCriadas, 0);

  const aluno = await Aluno.findOne({ where: { equipe_id: equipe.id, nome: "Fábio Silva" } });
  assert.equal(await AvaliacaoFisica.count({ where: { aluno_id: aluno.id } }), 2);
  const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: aluno.id }, attributes: ["id"] });
  assert.equal(await AvaliacaoFisicaMedida.count({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } }), 6);
});

test("vincular e completar: aluno pré-existente recebe as avaliações e o backfill sem sobrescrever", async (t) => {
  const existente = await Aluno.create({ equipe_id: equipe.id, nome: "Fábio Silva", sexo: "M" });
  t.after(async () => {
    const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: existente.id }, attributes: ["id"] });
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
    await AvaliacaoFisica.destroy({ where: { aluno_id: existente.id } });
    await Aluno.destroy({ where: { id: existente.id } });
  });

  const relatorio = await persistir(amostra(), { equipeId: equipe.id, models });
  assert.equal(relatorio.alunosCriados, 0);
  assert.equal(relatorio.alunosVinculados, 1);

  await existente.reload();
  assert.equal(existente.data_nascimento, "1980-08-13"); // preenchido (era null)
  assert.equal(existente.sexo, "M"); // mantido
  assert.equal(await AvaliacaoFisica.count({ where: { aluno_id: existente.id } }), 2);

  // Nenhum aluno novo com o mesmo nome foi criado.
  assert.equal(await Aluno.count({ where: { equipe_id: equipe.id, nome: "Fábio Silva" } }), 1);
});

test("mesmo nome, nascimento diferente -> pessoa diferente (cria novo aluno)", async (t) => {
  const homonimo = await Aluno.create({ equipe_id: equipe.id, nome: "Fábio Silva", data_nascimento: "1975-01-01" });
  t.after(async () => {
    const alunos = await Aluno.findAll({ where: { equipe_id: equipe.id, nome: "Fábio Silva" }, attributes: ["id"] });
    const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: alunos.map((a) => a.id) }, attributes: ["id"] });
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
    await AvaliacaoFisica.destroy({ where: { aluno_id: alunos.map((a) => a.id) } });
    await Aluno.destroy({ where: { id: alunos.map((a) => a.id) } });
  });

  const relatorio = await persistir(amostra(), { equipeId: equipe.id, models });
  assert.equal(relatorio.alunosCriados, 1);
  assert.equal(await Aluno.count({ where: { equipe_id: equipe.id, nome: "Fábio Silva" } }), 2);
  assert.equal(await AvaliacaoFisica.count({ where: { aluno_id: homonimo.id } }), 0);
});

test("constraint: duas medidas (avaliação, métrica, método) iguais são rejeitadas", async (t) => {
  const aluno = await Aluno.create({ equipe_id: equipe.id, nome: `Dup ${randomUUID()}` });
  const av = await AvaliacaoFisica.create({ aluno_id: aluno.id, equipe_id: equipe.id, data: "2020-01-01", origem: "legado_bodymove" });
  t.after(async () => {
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: av.id } });
    await AvaliacaoFisica.destroy({ where: { id: av.id } });
    await Aluno.destroy({ where: { id: aluno.id } });
  });

  await AvaliacaoFisicaMedida.create({ avaliacao_fisica_id: av.id, metrica_codigo: "peso", metodo: "direto", principal: true, valor: 70, origem_valor: "importado" });
  await assert.rejects(
    () => AvaliacaoFisicaMedida.create({ avaliacao_fisica_id: av.id, metrica_codigo: "peso", metodo: "direto", principal: false, valor: 71, origem_valor: "importado" }),
    /uq_medida_avaliacao_metrica_metodo|unique/i
  );
});

test("constraint: dois principais da mesma métrica/avaliação são rejeitados", async (t) => {
  const aluno = await Aluno.create({ equipe_id: equipe.id, nome: `Princ ${randomUUID()}` });
  const av = await AvaliacaoFisica.create({ aluno_id: aluno.id, equipe_id: equipe.id, data: "2020-02-02", origem: "legado_bodymove" });
  t.after(async () => {
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: av.id } });
    await AvaliacaoFisica.destroy({ where: { id: av.id } });
    await Aluno.destroy({ where: { id: aluno.id } });
  });

  await AvaliacaoFisicaMedida.create({ avaliacao_fisica_id: av.id, metrica_codigo: "percentual_gordura", metodo: "pollock_7", principal: true, valor: 18, origem_valor: "calculado" });
  await assert.rejects(
    () => AvaliacaoFisicaMedida.create({ avaliacao_fisica_id: av.id, metrica_codigo: "percentual_gordura", metodo: "durnin_womersley", principal: true, valor: 22, origem_valor: "calculado" }),
    /uq_medida_principal|unique/i
  );
});

test("escopo por equipe: import na equipe A não vaza para a equipe B", async (t) => {
  t.after(async () => {
    const alunos = await Aluno.findAll({ where: { equipe_id: [equipe.id, outraEquipe.id] }, attributes: ["id"] });
    const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: alunos.map((a) => a.id) }, attributes: ["id"] });
    await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
    await AvaliacaoFisica.destroy({ where: { aluno_id: alunos.map((a) => a.id) } });
    await Aluno.destroy({ where: { id: alunos.map((a) => a.id) } });
  });

  await persistir(amostra(), { equipeId: equipe.id, models });
  assert.equal(await Aluno.count({ where: { equipe_id: outraEquipe.id } }), 0);
  assert.equal(await AvaliacaoFisica.count({ where: { equipe_id: outraEquipe.id } }), 0);
});

test("dry-run: relatório é calculado sem gravar", async () => {
  const relatorio = await persistir(amostra(), { equipeId: equipe.id, dryRun: true, models });
  assert.equal(relatorio.alunosCriados, 1);
  assert.equal(relatorio.avaliacoesCriadas, 2);
  assert.equal(relatorio.medidasCriadas, 6);
  assert.equal(await Aluno.count({ where: { equipe_id: equipe.id, nome: "Fábio Silva" } }), 0);
});
