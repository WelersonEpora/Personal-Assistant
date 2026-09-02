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

async function criarRegistro(status, tipo = Registro.TIPOS.ATENDIMENTO) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status,
    tipo
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

// Reprocessamento manual (botão "Tentar novamente" na revisão): só o status
// de reenfileiramento (recebido) é verificado aqui - o resto do pipeline
// (transcrição/interpretação de fato) já é coberto por
// jobs/processador-fila-ia.test.js e não é reexecutado nestes testes.
test("reprocessar: Registro com erro_transcricao volta para recebido e é reenfileirado", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.ERRO_TRANSCRICAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  const resultado = await registroService.reprocessar(equipe.id, registro.id);
  assert.equal(resultado.status, Registro.STATUS.RECEBIDO);
});

test("reprocessar: Registro com erro_interpretacao volta para recebido e é reenfileirado", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.ERRO_INTERPRETACAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  const resultado = await registroService.reprocessar(equipe.id, registro.id);
  assert.equal(resultado.status, Registro.STATUS.RECEBIDO);
});

test("reprocessar: rejeita quando o Registro não está em estado de erro", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await assert.rejects(() => registroService.reprocessar(equipe.id, registro.id), /falha de transcrição ou interpretação/);
});

test("reprocessar: avaliação física em aguardando_revisao pode refazer a interpretação (docs/adr/0018)", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO, Registro.TIPOS.AVALIACAO_FISICA);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  const resultado = await registroService.reprocessar(equipe.id, registro.id);
  assert.equal(resultado.status, Registro.STATUS.RECEBIDO);
});

test("reprocessar: rejeita quando o Registro pertence a outra equipe", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.ERRO_TRANSCRICAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await assert.rejects(() => registroService.reprocessar(outraEquipe.id, registro.id), /não encontrado/);
});

// --- filtros de listagem (Histórico não carrega tudo de uma vez) ----------

async function criarRegistroEm(dataAtendimento, { tipo = Registro.TIPOS.ATENDIMENTO, alunoId = aluno.id } = {}) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: alunoId,
    iniciado_em: new Date(`${dataAtendimento}T12:00:00Z`),
    data_atendimento: dataAtendimento,
    status: Registro.STATUS.CONFIRMADO,
    tipo
  });
  return registro;
}

test("listar: filtra por janela de data_atendimento (de/ate)", async (t) => {
  const dentro = await criarRegistroEm("2026-05-10");
  const fora = await criarRegistroEm("2026-05-25");
  t.after(() => Registro.destroy({ where: { id: [dentro.id, fora.id] } }));

  const lista = await registroService.listar(equipe.id, { de: "2026-05-01", ate: "2026-05-15" });
  const ids = lista.map((r) => r.id);
  assert.ok(ids.includes(dentro.id));
  assert.ok(!ids.includes(fora.id));
});

test("listar: filtra por aluno_id e por tipo", async (t) => {
  const outroAluno = await Aluno.create({ equipe_id: equipe.id, nome: "Outro Aluno Filtro" });
  const atendimento = await criarRegistroEm("2026-06-10");
  const avaliacao = await criarRegistroEm("2026-06-11", { tipo: Registro.TIPOS.AVALIACAO_FISICA });
  const doOutro = await criarRegistroEm("2026-06-12", { alunoId: outroAluno.id });
  t.after(async () => {
    await Registro.destroy({ where: { id: [atendimento.id, avaliacao.id, doOutro.id] } });
    await Aluno.destroy({ where: { id: outroAluno.id } });
  });

  const soAtendimento = await registroService.listar(equipe.id, {
    de: "2026-06-01",
    ate: "2026-06-30",
    tipo: "atendimento"
  });
  const idsTipo = soAtendimento.map((r) => r.id);
  assert.ok(idsTipo.includes(atendimento.id));
  assert.ok(!idsTipo.includes(avaliacao.id));

  const soAluno = await registroService.listar(equipe.id, { de: "2026-06-01", ate: "2026-06-30", alunoId: outroAluno.id });
  assert.deepEqual(soAluno.map((r) => r.id), [doOutro.id]);
});

test("listar: rejeita data inválida, de > ate e tipo desconhecido", async () => {
  await assert.rejects(() => registroService.listar(equipe.id, { de: "2026-13-01" }), /formato|válida/);
  await assert.rejects(() => registroService.listar(equipe.id, { de: "2026-05-10", ate: "2026-05-01" }), /depois/);
  await assert.rejects(() => registroService.listar(equipe.id, { tipo: "qualquer" }), /tipo/);
});

test("listar: sem filtro de data mantém o comportamento antigo (todos os status pedidos)", async (t) => {
  const antigo = await criarRegistroEm("2020-01-01");
  t.after(() => Registro.destroy({ where: { id: antigo.id } }));

  const lista = await registroService.listar(equipe.id, { status: "confirmado" });
  assert.ok(lista.some((r) => r.id === antigo.id));
});

// docs/adr/0020 (adendo): a tela de Relatos é a caixa de entrada do pipeline -
// mostra tudo que ainda não virou dado oficial; confirmado sai dali e vive só
// no Histórico.
test('listar: status "abertos" traz os não confirmados e exclui os confirmados', async (t) => {
  const emRevisao = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO);
  const comErro = await criarRegistro(Registro.STATUS.ERRO_INTERPRETACAO);
  const confirmado = await criarRegistro(Registro.STATUS.CONFIRMADO);
  t.after(() => Registro.destroy({ where: { id: [emRevisao.id, comErro.id, confirmado.id] } }));

  const ids = (await registroService.listar(equipe.id, { status: "abertos" })).map((r) => r.id);
  assert.ok(ids.includes(emRevisao.id));
  assert.ok(ids.includes(comErro.id));
  assert.ok(!ids.includes(confirmado.id));
});
