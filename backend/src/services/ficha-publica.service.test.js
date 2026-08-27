"use strict";

// Acesso público à Ficha de Treino por token (docs/adr/0014): resolução,
// expiração, revogação, projeção sem campos sensíveis, "sempre a ficha
// ativa" e isolamento entre alunos. Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Exercicio, FichaTreino, FichaAcessoLink } = require("../models");
const fichaTreinoService = require("./fichaTreino.service");
const fichaAcessoLinkService = require("./fichaAcessoLink.service");
const fichaPublicaService = require("./ficha-publica.service");

let usuario;
let equipeA;
let equipeB;
let alunoDeA;
let alunoDeB;
let supino;
let agachamento;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  alunoDeA = await Aluno.create({ equipe_id: equipeA.id, nome: "Ana (Equipe A)" });
  alunoDeB = await Aluno.create({ equipe_id: equipeB.id, nome: "Bruno (Equipe B)" });
  supino = await Exercicio.create({ equipe_id: null, nome: "Supino reto", grupo_muscular: "Peito" });
  agachamento = await Exercicio.create({ equipe_id: equipeA.id, nome: "Agachamento", grupo_muscular: "Pernas" });
});

after(async () => {
  await FichaAcessoLink.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  await FichaTreino.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  await Exercicio.destroy({ where: { id: [supino.id, agachamento.id] } });
  await Aluno.destroy({ where: { id: [alunoDeA.id, alunoDeB.id] } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

async function gerarTokenPara(equipeId, alunoId) {
  const { token } = await fichaAcessoLinkService.gerar(equipeId, usuario.id, alunoId, {});
  return token;
}

test("obterFicha: token válido devolve a ficha ativa em projeção de leitura", async (t) => {
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Treino A",
    observacoes: "3x por semana",
    itens: [{ exercicioId: supino.id, series: 4, repeticoes: "8-12", cargaObs: "20kg" }]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  const resultado = await fichaPublicaService.obterFicha(token);

  assert.deepEqual(resultado.aluno, { nome: "Ana (Equipe A)" });
  assert.equal(resultado.ficha.nome, "Treino A");
  assert.equal(resultado.ficha.observacoes, "3x por semana");
  assert.equal(resultado.ficha.itens.length, 1);

  const item = resultado.ficha.itens[0];
  assert.deepEqual(item, {
    ordem: 1,
    series: 4,
    repeticoes: "8-12",
    cargaObs: "20kg",
    exercicio: {
      id: supino.id,
      nome: "Supino reto",
      grupoMuscular: "Peito",
      equipamento: null,
      instrucoes: null,
      temImagemInicio: false,
      temImagemFim: false,
      videoUrl: null
    }
  });
});

test("obterFicha: projeção não vaza equipe_id, criado_por, ids de ficha nem timestamps internos", async (t) => {
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    itens: [{ exercicioId: supino.id }]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  const serial = JSON.stringify(await fichaPublicaService.obterFicha(token));

  assert.ok(!serial.includes(equipeA.id), "sem equipe_id");
  assert.ok(!serial.includes(usuario.id), "sem criado_por");
  assert.ok(!serial.includes(alunoDeA.id), "sem aluno_id");
  assert.ok(!serial.includes("criadoPor"), "sem nome do personal");
  assert.ok(!serial.includes("updated_at") && !serial.includes("equipe_id"), "sem campos internos");
});

test("obterFicha: reflete automaticamente a nova versão da ficha (mesmo token)", async (t) => {
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Versão 1",
    itens: [{ exercicioId: supino.id }]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  assert.equal((await fichaPublicaService.obterFicha(token)).ficha.nome, "Versão 1");

  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Versão 2",
    itens: [{ exercicioId: agachamento.id }]
  });

  const depois = await fichaPublicaService.obterFicha(token);
  assert.equal(depois.ficha.nome, "Versão 2");
  assert.equal(depois.ficha.itens[0].exercicio.id, agachamento.id);
});

test("obterFicha: aluno sem ficha ativa - link válido, ficha nula", async (t) => {
  const token = await gerarTokenPara(equipeB.id, alunoDeB.id);
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeB.id } }));

  const resultado = await fichaPublicaService.obterFicha(token);
  assert.equal(resultado.aluno.nome, "Bruno (Equipe B)");
  assert.equal(resultado.ficha, null);
});

test("obterFicha: token desconhecido -> 404 LINK_INVALIDO", async () => {
  await assert.rejects(() => fichaPublicaService.obterFicha("token-que-nao-existe"), (err) => {
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, "LINK_INVALIDO");
    return true;
  });
});

test("obterFicha: token revogado -> 410 LINK_REVOGADO com mensagem de solicitar novo", async (t) => {
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } }));

  await fichaAcessoLinkService.revogar(equipeA.id, alunoDeA.id);

  await assert.rejects(() => fichaPublicaService.obterFicha(token), (err) => {
    assert.equal(err.statusCode, 410);
    assert.equal(err.code, "LINK_REVOGADO");
    assert.match(err.message, /Solicite um novo link/);
    return true;
  });
});

test("obterFicha: token expirado -> 410 LINK_EXPIRADO", async (t) => {
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } }));

  await FichaAcessoLink.update({ expira_em: new Date(Date.now() - 1000) }, { where: { token } });

  await assert.rejects(() => fichaPublicaService.obterFicha(token), (err) => {
    assert.equal(err.statusCode, 410);
    assert.equal(err.code, "LINK_EXPIRADO");
    return true;
  });
});

test("isolamento: token do aluno de A nunca devolve dados do aluno de B", async (t) => {
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Treino da Ana",
    itens: [{ exercicioId: supino.id }]
  });
  await fichaTreinoService.criarNovaVersao(equipeB.id, usuario.id, alunoDeB.id, {
    nome: "Treino do Bruno",
    itens: [{ exercicioId: supino.id }]
  });
  const tokenA = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
    await FichaTreino.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  });

  const resultado = await fichaPublicaService.obterFicha(tokenA);
  assert.equal(resultado.aluno.nome, "Ana (Equipe A)");
  assert.equal(resultado.ficha.nome, "Treino da Ana");
});

test("obterImagemDoExercicio: rejeita exercício que não está na ficha do token", async (t) => {
  const foraDaFicha = await Exercicio.create({ equipe_id: equipeA.id, nome: "Rosca direta" });
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    itens: [{ exercicioId: supino.id }]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
    await Exercicio.destroy({ where: { id: foraDaFicha.id } });
  });

  await assert.rejects(
    () => fichaPublicaService.obterImagemDoExercicio(token, foraDaFicha.id, "inicio"),
    /Imagem não encontrada/
  );
  // Exercício está na ficha, mas não tem imagem cadastrada -> mesma resposta.
  await assert.rejects(
    () => fichaPublicaService.obterImagemDoExercicio(token, supino.id, "inicio"),
    /Imagem não encontrada/
  );
});
