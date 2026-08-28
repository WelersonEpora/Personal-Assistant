"use strict";

// docs/adr/0016: backfill idempotente das métricas derivadas. Integração -
// toca o banco de teste (depende do seed do catálogo).

const path = require("node:path");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");

const { Equipe, Aluno, AvaliacaoFisica, AvaliacaoFisicaMedida } = require("../src/models");
const { calcularDerivadas } = require("../src/services/avaliacao-fisica/metricas-derivadas");

let equipe;
let aluno;
let avaliacao;

const SCRIPT = path.resolve(__dirname, "recalcular-derivadas-avaliacao-fisica.js");
function rodarBackfill(args = []) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8"
  });
}

before(async () => {
  equipe = await Equipe.create({ nome: `Backfill ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno backfill" });
  avaliacao = await AvaliacaoFisica.create({
    aluno_id: aluno.id,
    equipe_id: equipe.id,
    data: "2018-03-03",
    origem: "legado_bodymove"
  });
  // peso + % gordura principal, SEM massa_gorda/massa_magra (estado do legado)
  await AvaliacaoFisicaMedida.bulkCreate([
    { avaliacao_fisica_id: avaliacao.id, metrica_codigo: "peso", metodo: "direto", principal: true, valor: 70, origem_valor: "importado" },
    { avaliacao_fisica_id: avaliacao.id, metrica_codigo: "percentual_gordura", metodo: "pollock_7", principal: true, valor: 20, origem_valor: "calculado" }
  ]);
});

after(async () => {
  await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avaliacao.id } });
  await AvaliacaoFisica.destroy({ where: { id: avaliacao.id } });
  await Aluno.destroy({ where: { id: aluno.id } });
  await Equipe.destroy({ where: { id: equipe.id } });
});

test("dry-run não grava nada", async () => {
  rodarBackfill(["--dry-run"]);
  const codigos = (await AvaliacaoFisicaMedida.findAll({ where: { avaliacao_fisica_id: avaliacao.id } })).map(
    (m) => m.metrica_codigo
  );
  assert.ok(!codigos.includes("massa_gorda"));
});

test("backfill cria massa_gorda e massa_magra; 2ª execução é no-op", async () => {
  rodarBackfill();

  const medidas = await AvaliacaoFisicaMedida.findAll({ where: { avaliacao_fisica_id: avaliacao.id } });
  const porCodigo = Object.fromEntries(medidas.map((m) => [m.metrica_codigo, Number(m.valor)]));
  const esperado = Object.fromEntries(
    calcularDerivadas({ peso: 70, percentual_gordura: 20 }).map((d) => [d.metrica_codigo, d.valor])
  );
  assert.equal(porCodigo.massa_gorda, esperado.massa_gorda); // 14
  assert.equal(porCodigo.massa_magra, esperado.massa_magra); // 56

  const derivada = medidas.find((m) => m.metrica_codigo === "massa_gorda");
  assert.equal(derivada.origem_valor, "calculado");
  assert.equal(derivada.principal, true);

  const saida = rodarBackfill();
  assert.match(saida, /"derivadasCriadas": 0/);
  assert.match(saida, /"derivadasAtualizadas": 0/);
});
