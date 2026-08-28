"use strict";

// Testes de integração (tocam o banco de teste dedicado - NODE_ENV=test,
// POSTGRES_DB_TEST, ver backend/sequelize.config.js e src/config/env.js).
// Cobre a garantia central de docs/adr/0005-estrategia-sincronizacao.md:
// reenviar o mesmo Registro/entrada nunca duplica nada no banco.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Registro, RegistroEntrada } = require("../models");
const registroRepository = require("../repositories/registro.repository");

let usuario;
let equipe;
let outraEquipe;
let aluno;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipe = await Equipe.create({ nome: `Equipe de Teste ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra Equipe ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno de Teste" });
});

after(async () => {
  await Aluno.destroy({ where: { id: aluno.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
});

test("obterOuCriarRegistro: chamado duas vezes com o mesmo id não duplica nem sobrescreve", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  const primeira = await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: "Treino A", iniciadoEm: new Date() },
    null
  );
  assert.equal(primeira.criado, true);

  const segunda = await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: "Título diferente, ignorado", iniciadoEm: new Date() },
    null
  );
  assert.equal(segunda.criado, false);
  assert.equal(segunda.registro.titulo, "Treino A", "reenvio não deve sobrescrever o título já gravado");

  const total = await Registro.count({ where: { id: registroId } });
  assert.equal(total, 1);
});

test("obterOuCriarRegistro: grava o tipo na criação e não o altera no reenvio (docs/adr/0018)", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  const primeira = await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date(), tipo: "avaliacao_fisica" },
    null
  );
  assert.equal(primeira.registro.tipo, "avaliacao_fisica");

  const segunda = await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date(), tipo: "atendimento" },
    null
  );
  assert.equal(segunda.registro.tipo, "avaliacao_fisica", "reenvio não deve trocar o tipo já gravado");
});

test("obterOuCriarRegistro: tipo ausente cai em 'atendimento'", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  const { registro } = await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date() },
    null
  );
  assert.equal(registro.tipo, "atendimento");
});

test("obterOuCriarRegistro: grava data_atendimento; ausente deriva de iniciadoEm::date (docs/adr/0019)", async (t) => {
  const comData = randomUUID();
  const semData = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: [comData, semData] } }));

  const a = await registroRepository.obterOuCriarRegistro(
    {
      id: comData,
      usuarioId: usuario.id,
      equipeId: equipe.id,
      alunoId: aluno.id,
      iniciadoEm: new Date("2026-08-20T10:00:00Z"),
      dataAtendimento: "2026-08-18"
    },
    null
  );
  assert.equal(a.registro.data_atendimento, "2026-08-18");

  const b = await registroRepository.obterOuCriarRegistro(
    { id: semData, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, iniciadoEm: new Date("2026-08-20T10:00:00Z") },
    null
  );
  assert.equal(b.registro.data_atendimento, "2026-08-20");
});

test("obterOuCriarEntrada: reenviar a mesma (registro_id, ordem) não duplica a entrada", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date() },
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
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date() },
    null
  );
  await registroRepository.obterOuCriarEntrada({ registroId, ordem: 0, tipo: "texto", conteudoTexto: "Uma." }, null);
  await registroRepository.obterOuCriarEntrada({ registroId, ordem: 1, tipo: "texto", conteudoTexto: "Duas." }, null);

  const entradas = await RegistroEntrada.findAll({ where: { registro_id: registroId } });
  assert.equal(entradas.length, 2);
});

test("obterEntradaAudioAutorizada: retorna null quando a entrada pertence a um Registro de outra equipe", async (t) => {
  const registroId = randomUUID();
  t.after(async () => Registro.destroy({ where: { id: registroId } }));

  await registroRepository.obterOuCriarRegistro(
    { id: registroId, usuarioId: usuario.id, equipeId: equipe.id, alunoId: aluno.id, titulo: null, iniciadoEm: new Date() },
    null
  );
  const entrada = await registroRepository.obterOuCriarEntrada(
    { registroId, ordem: 0, tipo: "audio", duracaoSegundos: 5 },
    null
  );

  const comoEquipeDona = await registroRepository.obterEntradaAudioAutorizada({
    equipeId: equipe.id,
    registroId,
    entradaId: entrada.id
  });
  assert.ok(comoEquipeDona);

  const comoOutraEquipe = await registroRepository.obterEntradaAudioAutorizada({
    equipeId: outraEquipe.id,
    registroId,
    entradaId: entrada.id
  });
  assert.equal(comoOutraEquipe, null);
});
