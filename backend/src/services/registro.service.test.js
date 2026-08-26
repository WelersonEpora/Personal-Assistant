"use strict";

// Regra central (docs/adr/0007-separacao-ia-persistencia.md): um Registro só
// pode ser excluído (soft-delete) ANTES de confirmado - depois disso já
// virou Validacao, dado oficial do histórico do aluno.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Registro, RegistroEntrada } = require("../models");
const registroService = require("./registro.service");

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

async function criarRegistro(status) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status
  });
  await RegistroEntrada.create({ registro_id: registro.id, ordem: 0, tipo: "texto", conteudo_texto: "Conteúdo de teste." });
  return registro;
}

test("excluir: marca deletado_em e some da listagem da equipe", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await registroService.excluir(equipe.id, registro.id);

  const registroAtualizado = await Registro.findByPk(registro.id);
  assert.ok(registroAtualizado.deletado_em, "deletado_em deveria estar preenchido");

  const lista = await registroService.listar(equipe.id, {});
  assert.equal(lista.some((r) => r.id === registro.id), false);
});

test("excluir: rejeita quando o Registro já está confirmado", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.CONFIRMADO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await assert.rejects(() => registroService.excluir(equipe.id, registro.id), /não pode ser excluído/);

  const registroAtualizado = await Registro.findByPk(registro.id);
  assert.equal(registroAtualizado.deletado_em, null);
});

test("excluir: rejeita quando o Registro pertence a outra equipe", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.RECEBIDO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await assert.rejects(() => registroService.excluir(outraEquipe.id, registro.id), /não encontrado/);

  const registroAtualizado = await Registro.findByPk(registro.id);
  assert.equal(registroAtualizado.deletado_em, null);
});

test("excluir: chamado duas vezes no mesmo Registro rejeita a segunda vez", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.RECEBIDO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await registroService.excluir(equipe.id, registro.id);

  await assert.rejects(() => registroService.excluir(equipe.id, registro.id), /não encontrado/);
});
