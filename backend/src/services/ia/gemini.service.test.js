"use strict";

// Retry de erro transitório do Gemini (docs/adr/0006). Não chama a API real -
// testa só a política: o que é transitório e o comportamento de re-tentativa.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { comRetry, ehTransitorio } = require("./gemini.service");

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
