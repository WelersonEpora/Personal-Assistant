"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const env = require("../../config/env");
const autenticar = require("./auth.middleware");

function chamar(req) {
  let erroRecebido;
  let chamouNext = false;
  autenticar(req, {}, (err) => {
    chamouNext = true;
    erroRecebido = err;
  });
  return { chamouNext, erroRecebido };
}

test("autenticar: rejeita requisição sem header Authorization", () => {
  const { erroRecebido } = chamar({ get: () => undefined });
  assert.equal(erroRecebido?.statusCode, 401);
});

test("autenticar: rejeita header sem esquema Bearer", () => {
  const { erroRecebido } = chamar({ get: () => "Basic abc123" });
  assert.equal(erroRecebido?.statusCode, 401);
});

test("autenticar: rejeita token inválido", () => {
  const { erroRecebido } = chamar({ get: () => "Bearer token-invalido" });
  assert.equal(erroRecebido?.statusCode, 401);
});

test("autenticar: rejeita token expirado", () => {
  const tokenExpirado = jwt.sign({ sub: "usuario-1" }, env.jwt.secret, { expiresIn: -10 });
  const { erroRecebido } = chamar({ get: () => `Bearer ${tokenExpirado}` });
  assert.equal(erroRecebido?.statusCode, 401);
});

test("autenticar: token válido chama next() sem erro e define req.usuarioId", () => {
  const token = jwt.sign({ sub: "usuario-1" }, env.jwt.secret, { expiresIn: "1h" });
  const req = { get: () => `Bearer ${token}` };
  const { chamouNext, erroRecebido } = chamar(req);
  assert.equal(chamouNext, true);
  assert.equal(erroRecebido, undefined);
  assert.equal(req.usuarioId, "usuario-1");
});
