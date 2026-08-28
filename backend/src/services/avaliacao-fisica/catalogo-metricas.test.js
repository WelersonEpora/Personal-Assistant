"use strict";

// docs/adr/0016 (proposta v3 §3.2): o catálogo núcleo de métricas. Confere a
// integridade da lista (fonte única) e a idempotência do seeder.

const path = require("node:path");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const models = require("../../models");
const { MetricaAvaliacaoFisica } = models;
const { METRICAS, CASAS_POR_CODIGO } = require("./catalogo-metricas");
const { METODOS_VALIDOS } = require("./metodos");

const CATEGORIAS = new Set(MetricaAvaliacaoFisica.CATEGORIAS);
const UNIDADES = new Set(MetricaAvaliacaoFisica.UNIDADES);
const DIRECOES = new Set(MetricaAvaliacaoFisica.DIRECOES);

test("a lista é consistente: códigos únicos, categorias/unidades/direções no vocabulário", () => {
  const codigos = METRICAS.map(([c]) => c);
  assert.equal(new Set(codigos).size, codigos.length, "código duplicado no catálogo");
  assert.ok(codigos.length >= 38);

  for (const [codigo, rotulo, categoria, unidade, casas, direcao] of METRICAS) {
    assert.ok(rotulo, `${codigo} sem rótulo`);
    assert.ok(CATEGORIAS.has(categoria), `${codigo}: categoria inválida ${categoria}`);
    assert.ok(UNIDADES.has(unidade), `${codigo}: unidade inválida ${unidade}`);
    assert.ok(DIRECOES.has(direcao), `${codigo}: direção inválida ${direcao}`);
    assert.ok(Number.isInteger(casas) && casas >= 0 && casas <= 3);
  }

  // imc e rcq (derivadas do escopo) precisam existir no catálogo.
  assert.ok(CASAS_POR_CODIGO.imc === 1);
  assert.ok(CASAS_POR_CODIGO.rcq === 2);
});

test("os métodos do legado referenciam códigos de METODOS_VALIDOS", () => {
  const { METODO_POR_TABELA_LEGADO } = require("./metodos");
  for (const metodo of Object.values(METODO_POR_TABELA_LEGADO)) {
    assert.ok(METODOS_VALIDOS.includes(metodo), `método ${metodo} fora de METODOS_VALIDOS`);
  }
});

test("o banco de teste tem o catálogo seedado e sem itens fora do vocabulário", async () => {
  const linhas = await MetricaAvaliacaoFisica.findAll();
  assert.ok(linhas.length >= METRICAS.length);
  for (const l of linhas) {
    assert.ok(UNIDADES.has(l.unidade));
    assert.ok(CATEGORIAS.has(l.categoria));
  }
});

test("o seeder é idempotente: rodar up() de novo não insere nem quebra", async () => {
  const seeder = require(path.resolve(__dirname, "../../../database/seeders/20260828110000-seed-metricas-avaliacao-fisica.js"));
  const antes = await MetricaAvaliacaoFisica.count();
  await seeder.up(models.sequelize.getQueryInterface());
  const depois = await MetricaAvaliacaoFisica.count();
  assert.equal(depois, antes);
});

after(() => {
  // nada a limpar - o catálogo é dado de referência permanente.
});
