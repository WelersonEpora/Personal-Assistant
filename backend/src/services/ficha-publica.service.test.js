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
const equipeService = require("./equipe.service");

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

// Um exercício isolado = grupo "simples" de um item (docs/adr/0026).
function simples(exercicioId) {
  return { tipo: "simples", itens: [{ exercicioId }] };
}

test("obterFicha: token válido devolve a ficha ativa em projeção de leitura", async (t) => {
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Treino A",
    observacoes: "3x por semana",
    grupos: [
      { tipo: "simples", series: 4, descanso: "90s", itens: [{ exercicioId: supino.id, repeticoes: "8-12", cargaObs: "20kg" }] }
    ]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  const resultado = await fichaPublicaService.obterFicha(token);

  assert.deepEqual(resultado.aluno, { nome: "Ana (Equipe A)" });
  assert.equal(resultado.fichas.length, 1);
  const [ficha] = resultado.fichas;
  assert.equal(ficha.nome, "Treino A");
  assert.equal(ficha.observacoes, "3x por semana");
  assert.equal(ficha.grupos.length, 1);

  const { itens, ...grupo } = ficha.grupos[0];
  assert.deepEqual(grupo, { ordem: 1, tipo: "simples", series: 4, descanso: "90s", observacoes: null });
  assert.equal(itens.length, 1);

  const item = itens[0];
  assert.deepEqual(item, {
    ordem: 1,
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
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    grupos: [simples(supino.id)]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  const serial = JSON.stringify(await fichaPublicaService.obterFicha(token));

  assert.ok(!serial.includes(ficha.id), "sem id da ficha");
  assert.ok(!serial.includes(ficha.grupos[0].id), "sem id do grupo");
  assert.ok(!serial.includes(equipeA.id), "sem equipe_id");
  assert.ok(!serial.includes(usuario.id), "sem criado_por");
  assert.ok(!serial.includes(alunoDeA.id), "sem aluno_id");
  assert.ok(!serial.includes("criadoPor"), "sem nome do personal");
  assert.ok(!serial.includes("updated_at") && !serial.includes("equipe_id"), "sem campos internos");
});

test("obterFicha: reflete automaticamente a nova versão da ficha (mesmo token)", async (t) => {
  const versao1 = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Versão 1",
    grupos: [simples(supino.id)]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  assert.deepEqual((await fichaPublicaService.obterFicha(token)).fichas.map((f) => f.nome), ["Versão 1"]);

  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Versão 2",
    substituiFichaId: versao1.id,
    grupos: [simples(agachamento.id)]
  });

  const depois = await fichaPublicaService.obterFicha(token);
  assert.deepEqual(depois.fichas.map((f) => f.nome), ["Versão 2"]);
  assert.equal(depois.fichas[0].grupos[0].itens[0].exercicio.id, agachamento.id);
});

test("obterFicha: devolve todas as fichas ativas do aluno, na ordem do nome, com os grupos conjugados", async (t) => {
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Superiores",
    grupos: [
      {
        tipo: "biset",
        series: 3,
        descanso: "60s",
        itens: [
          { exercicioId: supino.id, repeticoes: "12" },
          { exercicioId: agachamento.id, repeticoes: "30s" }
        ]
      }
    ]
  });
  const arquivada = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Antiga",
    grupos: [simples(supino.id)]
  });
  await fichaTreinoService.arquivar(equipeA.id, arquivada.id);
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Inferiores",
    grupos: [simples(agachamento.id)]
  });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
    await FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  const { fichas } = await fichaPublicaService.obterFicha(token);
  assert.deepEqual(fichas.map((f) => f.nome), ["Inferiores", "Superiores"], "arquivada fica de fora");

  const [biset] = fichas[1].grupos;
  assert.equal(biset.tipo, "biset");
  assert.equal(biset.series, 3);
  assert.equal(biset.descanso, "60s");
  assert.deepEqual(biset.itens.map((i) => [i.exercicio.nome, i.repeticoes]), [
    ["Supino reto", "12"],
    ["Agachamento", "30s"]
  ]);
});

test("obterFicha: aluno sem ficha ativa - link válido, lista vazia", async (t) => {
  const token = await gerarTokenPara(equipeB.id, alunoDeB.id);
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeB.id } }));

  const resultado = await fichaPublicaService.obterFicha(token);
  assert.equal(resultado.aluno.nome, "Bruno (Equipe B)");
  assert.deepEqual(resultado.fichas, []);
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
    grupos: [simples(supino.id)]
  });
  await fichaTreinoService.criarNovaVersao(equipeB.id, usuario.id, alunoDeB.id, {
    nome: "Treino do Bruno",
    grupos: [simples(supino.id)]
  });
  const tokenA = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await FichaAcessoLink.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
    await FichaTreino.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  });

  const resultado = await fichaPublicaService.obterFicha(tokenA);
  assert.equal(resultado.aluno.nome, "Ana (Equipe A)");
  assert.deepEqual(resultado.fichas.map((f) => f.nome), ["Treino da Ana"]);
});

test("obterImagemDoExercicio: rejeita exercício que não está na ficha do token", async (t) => {
  const foraDaFicha = await Exercicio.create({ equipe_id: equipeA.id, nome: "Rosca direta" });
  await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    grupos: [simples(supino.id)]
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

// docs/adr/0030 - identidade da equipe no link do aluno.
test("obterFicha: traz nome e presença de logo da equipe do token, sem id", async (t) => {
  const token = await gerarTokenPara(equipeB.id, alunoDeB.id);
  t.after(() => FichaAcessoLink.destroy({ where: { aluno_id: alunoDeB.id } }));

  const resultado = await fichaPublicaService.obterFicha(token);
  assert.deepEqual(resultado.equipe, { nome: equipeB.nome, temLogo: false });
});

test("obterLogo: serve o logo da equipe do token e nunca o de outra equipe", async (t) => {
  await equipeService.atualizarLogo(equipeA.id, { buffer: Buffer.from("logo-de-A"), mimeType: "image/png" });
  const tokenA = await gerarTokenPara(equipeA.id, alunoDeA.id);
  const tokenB = await gerarTokenPara(equipeB.id, alunoDeB.id);
  t.after(async () => {
    await equipeService.removerLogo(equipeA.id);
    await FichaAcessoLink.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  });

  const { buffer, mimeType } = await fichaPublicaService.obterLogo(tokenA);
  assert.equal(buffer.toString(), "logo-de-A");
  assert.equal(mimeType, "image/png");
  assert.equal((await fichaPublicaService.obterFicha(tokenA)).equipe.temLogo, true);
  await assert.rejects(() => fichaPublicaService.obterLogo(tokenB), /não tem logo/);
});

test("obterLogo: token revogado não serve o logo", async (t) => {
  await equipeService.atualizarLogo(equipeA.id, { buffer: Buffer.from("logo-de-A"), mimeType: "image/png" });
  const token = await gerarTokenPara(equipeA.id, alunoDeA.id);
  t.after(async () => {
    await equipeService.removerLogo(equipeA.id);
    await FichaAcessoLink.destroy({ where: { aluno_id: alunoDeA.id } });
  });

  await fichaAcessoLinkService.revogar(equipeA.id, alunoDeA.id);
  await assert.rejects(() => fichaPublicaService.obterLogo(token), (err) => err.code === "LINK_REVOGADO");
});
