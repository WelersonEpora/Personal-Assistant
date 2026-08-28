"use strict";

// Isolamento multi-tenant (docs/adr/0011): cada equipe só enxerga os
// próprios alunos. Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Registro, AvaliacaoFisica } = require("../models");
const alunoService = require("./aluno.service");

let usuario;
let equipeA;
let equipeB;
let alunoDeB;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  alunoDeB = await Aluno.create({ equipe_id: equipeB.id, nome: "Aluno da Equipe B" });
});

after(async () => {
  await Aluno.destroy({ where: { id: alunoDeB.id } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

test("getAluno: equipe A não consegue acessar aluno da equipe B", async () => {
  await assert.rejects(() => alunoService.getAluno(equipeA.id, alunoDeB.id), /não encontrado/);
});

test("getAluno: equipe dona consegue acessar o próprio aluno", async () => {
  const encontrado = await alunoService.getAluno(equipeB.id, alunoDeB.id);
  assert.equal(encontrado.id, alunoDeB.id);
});

test("listAlunos: lista só traz alunos da equipe autenticada", async (t) => {
  const outroAlunoDeA = await alunoService.createAluno(equipeA.id, { nome: "Aluno da Equipe A" });
  t.after(() => Aluno.destroy({ where: { id: outroAlunoDeA.id } }));

  const listaDeA = await alunoService.listAlunos(equipeA.id);
  assert.equal(listaDeA.length, 1);
  assert.equal(listaDeA[0].id, outroAlunoDeA.id);

  const listaDeB = await alunoService.listAlunos(equipeB.id);
  assert.equal(listaDeB.length, 1);
  assert.equal(listaDeB[0].id, alunoDeB.id);
});

test("listAlunos: card traz registros_count (relatos nao deletados) e avaliacoes_fisicas_count", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno com contadores" });
  const registroVivo = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipeA.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status: Registro.STATUS.RECEBIDO
  });
  const registroDeletado = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipeA.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status: Registro.STATUS.RECEBIDO,
    deletado_em: new Date()
  });
  const avaliacao = await AvaliacaoFisica.create({
    aluno_id: aluno.id,
    equipe_id: equipeA.id,
    data: "2026-08-01",
    origem: AvaliacaoFisica.ORIGENS.MANUAL
  });
  t.after(async () => {
    await AvaliacaoFisica.destroy({ where: { id: avaliacao.id } });
    await Registro.destroy({ where: { id: [registroVivo.id, registroDeletado.id] } });
    await Aluno.destroy({ where: { id: aluno.id } });
  });

  const lista = await alunoService.listAlunos(equipeA.id);
  const encontrado = lista.find((a) => a.id === aluno.id);
  assert.equal(encontrado.get("registros_count"), 1);
  assert.equal(encontrado.get("avaliacoes_fisicas_count"), 1);
});

test("createAluno: rejeita nome vazio", async () => {
  await assert.rejects(() => alunoService.createAluno(equipeA.id, { nome: "   " }), /nome/);
});

test("createAluno: aceita telefone e updateAluno permite alterá-lo", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno com telefone", telefone: "11999990000" });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  assert.equal(aluno.telefone, "11999990000");

  const atualizado = await alunoService.updateAluno(equipeA.id, aluno.id, { telefone: "11888880000" });
  assert.equal(atualizado.telefone, "11888880000");
});

test("data_nascimento e sexo: criar e editar aceitam; formato inválido é rejeitado (docs/adr/0016)", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, {
    nome: "Aluno com nascimento",
    data_nascimento: "1990-05-10",
    sexo: "F"
  });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  assert.equal(aluno.data_nascimento, "1990-05-10");
  assert.equal(aluno.sexo, "F");

  const atualizado = await alunoService.updateAluno(equipeA.id, aluno.id, { data_nascimento: "1991-01-01", sexo: null });
  assert.equal(atualizado.data_nascimento, "1991-01-01");
  assert.equal(atualizado.sexo, null);

  await assert.rejects(
    () => alunoService.updateAluno(equipeA.id, aluno.id, { data_nascimento: "10/05/1990" }),
    /AAAA-MM-DD/
  );
  await assert.rejects(() => alunoService.updateAluno(equipeA.id, aluno.id, { sexo: "X" }), /"F" ou "M"/);
});

test("atualizarFoto: rejeita formato de imagem não suportado", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno para foto" });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  await assert.rejects(
    () => alunoService.atualizarFoto(equipeA.id, aluno.id, { buffer: Buffer.from("x"), mimeType: "image/gif" }),
    /não suportado/
  );
});

test("removerFoto: rejeita quando o aluno não tem foto cadastrada", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno sem foto" });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  await assert.rejects(() => alunoService.removerFoto(equipeA.id, aluno.id), /não tem foto/);
});

test("removerFoto: limpa foto_caminho depois de um upload", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno com foto" });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  await alunoService.atualizarFoto(equipeA.id, aluno.id, { buffer: Buffer.from("fake-jpeg"), mimeType: "image/jpeg" });
  const atualizado = await alunoService.removerFoto(equipeA.id, aluno.id);
  assert.equal(atualizado.foto_caminho, null);
});

// Regra central desta feature: excluir um aluno leva consigo todos os seus
// Registros (docs de arquitetura do produto - relatos/avaliações não fazem
// sentido sem o aluno dono).
test("excluirAluno: soft-delete some da listagem e leva os Registros do aluno junto", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno a excluir" });
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipeA.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status: Registro.STATUS.CONFIRMADO
  });
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await Aluno.destroy({ where: { id: aluno.id } });
  });

  await alunoService.excluirAluno(equipeA.id, aluno.id);

  await assert.rejects(() => alunoService.getAluno(equipeA.id, aluno.id), /não encontrado/);

  const registroAtualizado = await Registro.findByPk(registro.id);
  assert.ok(registroAtualizado.deletado_em, "deletado_em do Registro deveria estar preenchido");
});

test("excluirAluno: rejeita quando o aluno pertence a outra equipe", async () => {
  await assert.rejects(() => alunoService.excluirAluno(equipeA.id, alunoDeB.id), /não encontrado/);
});

test("createAluno: nasce inativo=false e favorito=false por padrão; updateAluno altera os dois", async (t) => {
  const aluno = await alunoService.createAluno(equipeA.id, { nome: "Aluno padrão" });
  t.after(() => Aluno.destroy({ where: { id: aluno.id } }));

  assert.equal(aluno.ativo, true);
  assert.equal(aluno.favorito, false);

  const atualizado = await alunoService.updateAluno(equipeA.id, aluno.id, { ativo: false, favorito: true });
  assert.equal(atualizado.ativo, false);
  assert.equal(atualizado.favorito, true);
});

// Ordenação da listagem (aluno.repository.js::findAllByEquipe): ativos
// antes de inativos e, dentro de cada grupo, favoritos antes do resto -
// alfabético como critério final nos dois casos.
test("listAlunos: ordena ativos antes de inativos e favoritos antes do resto dentro de cada grupo", async (t) => {
  const zeca = await alunoService.createAluno(equipeA.id, { nome: "Zeca Ativo" });
  const ana = await alunoService.createAluno(equipeA.id, { nome: "Ana Ativa Favorita" });
  const bruno = await alunoService.createAluno(equipeA.id, { nome: "Bruno Inativo" });
  await alunoService.updateAluno(equipeA.id, ana.id, { favorito: true });
  await alunoService.updateAluno(equipeA.id, bruno.id, { ativo: false });
  t.after(() => Aluno.destroy({ where: { id: [zeca.id, ana.id, bruno.id] } }));

  const lista = await alunoService.listAlunos(equipeA.id);
  assert.deepEqual(
    lista.map((a) => a.nome),
    ["Ana Ativa Favorita", "Zeca Ativo", "Bruno Inativo"]
  );
});
