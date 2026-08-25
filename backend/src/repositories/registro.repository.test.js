"use strict";

// Testes de integração (tocam o banco de teste dedicado - NODE_ENV=test,
// POSTGRES_DB_TEST, ver backend/sequelize.config.js e src/config/env.js).
// Cobre a garantia central de docs/adr/0005-estrategia-sincronizacao.md:
// reenviar o mesmo Registro/entrada nunca duplica nada no banco.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Aluno, Registro, RegistroEntrada } = require("../models");
const registroRepository = require("../repositories/registro.repository");

let usuario;
let aluno;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  aluno = await Aluno.create({ usuario_id: usuario.id, nome: "Aluno de Teste" });
});

after(async () => {
  await Aluno.destroy({ where: { id: aluno.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

test("obterOuCriarRegistro: chamado duas vezes com o mesmo id não duplica nem sobrescreve", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  const primeira = await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, alunoId: aluno.id, titulo: "Treino A", iniciadoEm: new Date() },
    null
  );
  assert.equal(primeira.criado, true);

  const segunda = await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, alunoId: aluno.id, titulo: "Título diferente, ignorado", iniciadoEm: new Date() },
    null
  );
  assert.equal(segunda.criado, false);
  assert.equal(segunda.registro.titulo, "Treino A", "reenvio não deve sobrescrever o título já gravado");

  const total = await Registro.count({ where: { id: registroId } });
  assert.equal(total, 1);
});

test("obterOuCriarEntrada: reenviar a mesma (registro_id, ordem) não duplica a entrada", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date() },
    null
  );

  await registroRepository.obterOuCriarEntrada(
    { registroId, ordem: 0, tipo: "texto", conteudoTexto: "Primeira tentativa." },
    null
  );
  await registroRepository.obterOuCriarEntrada(
    { registroId, ordem: 0, tipo: "texto", conteudoTexto: "Reenvio com texto diferente." },
    null
  );

  const entradas = await RegistroEntrada.findAll({ where: { registro_id: registroId } });
  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].conteudo_texto, "Primeira tentativa.");
});

test("obterOuCriarEntrada: entradas com ordens diferentes coexistem normalmente", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date() },
    null
  );
  await registroRepository.obterOuCriarEntrada({ registroId, ordem: 0, tipo: "texto", conteudoTexto: "Uma." }, null);
  await registroRepository.obterOuCriarEntrada({ registroId, ordem: 1, tipo: "texto", conteudoTexto: "Duas." }, null);

  const entradas = await RegistroEntrada.findAll({ where: { registro_id: registroId } });
  assert.equal(entradas.length, 2);
});
