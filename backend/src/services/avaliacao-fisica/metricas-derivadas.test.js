"use strict";

// docs/adr/0016 (proposta v3 §3.4): IMC e RCQ são derivadas `calculado`,
// recalculadas a partir de outras medidas da mesma avaliação. Unitário puro.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { calcularDerivadas, arredondar } = require("./metricas-derivadas");

test("IMC: peso + altura -> imc calculado e arredondado a 1 casa", () => {
  const [imc] = calcularDerivadas({ peso: 86, altura: 186 });
  assert.equal(imc.metrica_codigo, "imc");
  assert.equal(imc.metodo, "direto");
  assert.equal(imc.principal, true);
  assert.equal(imc.origem_valor, "calculado");
  // 86 / 1.86^2 = 24.858... -> 24.9
  assert.equal(imc.valor, 24.9);
});

test("RCQ: cintura + quadril -> rcq a 2 casas", () => {
  const derivadas = calcularDerivadas({ perimetro_cintura: 84, perimetro_quadril: 107 });
  const rcq = derivadas.find((d) => d.metrica_codigo === "rcq");
  assert.equal(rcq.valor, 0.79); // 84/107 = 0.7850 -> 0.79
});

test("massa gorda/magra: derivadas de peso + % gordura acompanhada (2 compartimentos)", () => {
  const d = calcularDerivadas({ peso: 80, percentual_gordura: 20 });
  const porCodigo = Object.fromEntries(d.map((x) => [x.metrica_codigo, x]));
  assert.equal(porCodigo.massa_gorda.valor, 16); // 80 * 20 / 100
  assert.equal(porCodigo.massa_gorda.origem_valor, "calculado");
  assert.equal(porCodigo.massa_magra.valor, 64); // 80 - 16 (encadeada)
});

test("massa gorda/magra: sem % gordura principal, nenhuma das duas sai", () => {
  const codigos = calcularDerivadas({ peso: 80, altura: 175 }).map((x) => x.metrica_codigo);
  assert.ok(!codigos.includes("massa_gorda"));
  assert.ok(!codigos.includes("massa_magra"));
});

test("massa_magra depende da massa_gorda calculada, não de uma entrada", () => {
  // massa_gorda não vem no mapa de entrada; ainda assim massa_magra é derivada
  const d = calcularDerivadas({ peso: 100, percentual_gordura: 30.75 });
  const gorda = d.find((x) => x.metrica_codigo === "massa_gorda");
  const magra = d.find((x) => x.metrica_codigo === "massa_magra");
  assert.equal(gorda.valor, 30.8); // 30.75 -> 1 casa
  assert.equal(magra.valor, 69.2); // 100 - 30.8 (usa a massa_gorda já arredondada)
});

test("entrada faltando -> métrica derivada não é produzida (série esparsa)", () => {
  assert.deepEqual(calcularDerivadas({ peso: 80 }), []); // sem altura -> sem imc
  assert.deepEqual(calcularDerivadas({ perimetro_cintura: 90 }), []); // sem quadril -> sem rcq
});

test("valores <= 0 são ignorados", () => {
  assert.deepEqual(calcularDerivadas({ peso: 0, altura: 170 }), []);
  assert.deepEqual(calcularDerivadas({ peso: 70, altura: 0 }), []);
});

test("aceita valores string (vindos de NUMERIC do banco)", () => {
  const [imc] = calcularDerivadas({ peso: "70.000", altura: "175.000" });
  assert.equal(imc.valor, 22.9);
});

test("arredondar: meio para cima, sem ruído de float", () => {
  assert.equal(arredondar(1.005, 2), 1.01);
  assert.equal(arredondar(24.858, 1), 24.9);
});
