"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { exigirOwner } = require("./papel.middleware");

function chamar(req) {
  let erroRecebido;
  let chamouNext = false;
  exigirOwner(req, {}, (err) => {
    chamouNext = true;
    erroRecebido = err;
  });
  return { chamouNext, erroRecebido };
}

test("exigirOwner: chama next() sem erro quando req.papel é owner", () => {
  const { chamouNext, erroRecebido } = chamar({ papel: "owner" });
  assert.equal(chamouNext, true);
  assert.equal(erroRecebido, undefined);
});

test("exigirOwner: rejeita colaborador com 403", () => {
  const { erroRecebido } = chamar({ papel: "colaborador" });
  assert.equal(erroRecebido?.statusCode, 403);
});

test("exigirOwner: rejeita ausência de papel com 403", () => {
  const { erroRecebido } = chamar({});
  assert.equal(erroRecebido?.statusCode, 403);
});
