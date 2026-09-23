"use strict";

// docs/adr/0024: % de gordura por protocolo (Pollock 7 dobras). Os casos de
// referência são avaliações reais do BodyMove (só números - dobras, idade,
// sexo e a % que o sistema antigo calculou), um por faixa de constante de
// Lohman. A conta nova bate com as 319 avaliações Pollock 7 do legado.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { calcularPercentualGordura, idadeEm, DOBRAS_POLLOCK_7 } = require("./protocolos-gordura");

// ordem das dobras = DOBRAS_POLLOCK_7 (peitoral, axilar média, tricipital,
// subescapular, abdominal, supra-ilíaca, coxa)
function dobras(valores) {
  return Object.fromEntries(DOBRAS_POLLOCK_7.map((c, i) => [c, valores[i]]));
}

const CASOS_BODYMOVE = [
  { sexo: "F", idade: 43, dobras: [9, 7, 14, 10, 15, 9, 22], esperado: 17.67 },
  { sexo: "F", idade: 33, dobras: [10, 8, 11, 10, 14, 6, 19], esperado: 15.74 },
  { sexo: "F", idade: 19, dobras: [7, 7, 10, 10, 14, 8, 15], esperado: 12.61 },
  { sexo: "M", idade: 29, dobras: [11, 12, 10, 15, 27, 23, 18], esperado: 16.72 },
  { sexo: "M", idade: 47, dobras: [11, 7, 5, 10, 11, 5, 5], esperado: 9.8 },
  { sexo: "M", idade: 18, dobras: [4, 4, 5, 6, 6, 5, 7], esperado: 3.27 }
];

for (const c of CASOS_BODYMOVE) {
  test(`pollock_7 bate com o BodyMove: ${c.sexo}, ${c.idade} anos -> ${c.esperado}%`, () => {
    const r = calcularPercentualGordura("pollock_7", { dobras: dobras(c.dobras), sexo: c.sexo, idade: c.idade });
    assert.ok(Math.abs(r.percentual - c.esperado) < 0.01, `calculado ${r.percentual}`);
    assert.ok(r.densidade > 1 && r.densidade < 1.1);
  });
}

test("pollock_7: exemplo da ADR - mulher, 30 anos, soma 120 mm", () => {
  const r = calcularPercentualGordura("pollock_7", {
    dobras: dobras([20, 15, 20, 15, 20, 15, 15]),
    sexo: "F",
    idade: 30
  });
  assert.equal(r.densidade.toFixed(4), "1.0449");
  assert.equal(r.percentual.toFixed(1), "22.4"); // 5,03/D − 4,59 (Lohman, mulher 20+)
});

test("lista o que falta: sexo, nascimento e dobras", () => {
  const d = dobras([10, 10, 10, 10, 10, 10, 10]);
  delete d.dobra_coxa;
  const r = calcularPercentualGordura("pollock_7", { dobras: d, sexo: null, idade: null });
  assert.deepEqual(r.faltando.sort(), ["data_nascimento", "dobra_coxa", "sexo"]);
});

test("abaixo da idade mínima não calcula", () => {
  const r = calcularPercentualGordura("pollock_7", {
    dobras: dobras([10, 10, 10, 10, 10, 10, 10]),
    sexo: "M",
    idade: 14
  });
  assert.deepEqual(r.faltando, ["idade_minima"]);
});

test("idadeEm: idade na data da avaliação, respeitando o aniversário", () => {
  assert.equal(idadeEm("1990-09-24", "2026-09-23"), 35);
  assert.equal(idadeEm("1990-09-23", "2026-09-23"), 36);
  assert.equal(idadeEm(null, "2026-09-23"), null);
});
