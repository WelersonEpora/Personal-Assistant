"use strict";

// Preservação de histórico (sem versionamento explícito) e isolamento
// multi-tenant da Ficha de Treino (docs/adr/0013); grupos conjugados e várias
// fichas ativas por aluno (docs/adr/0026). Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Exercicio, FichaTreino } = require("../models");
const fichaTreinoService = require("./fichaTreino.service");

let usuario;
let equipeA;
let equipeB;
let alunoDeA;
let alunoDeB;
let exercicioSupino;
let exercicioAgachamento;
let exercicioAbdominal;
let exercicioDeB;

// Um exercício isolado = grupo "simples" de um item.
function simples(exercicioId, extras = {}) {
  return { tipo: "simples", ...extras, itens: [{ exercicioId }] };
}

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  alunoDeA = await Aluno.create({ equipe_id: equipeA.id, nome: "Aluno da Equipe A" });
  alunoDeB = await Aluno.create({ equipe_id: equipeB.id, nome: "Aluno da Equipe B" });
  exercicioSupino = await Exercicio.create({ equipe_id: null, nome: "Supino reto" });
  exercicioAgachamento = await Exercicio.create({ equipe_id: equipeA.id, nome: "Agachamento livre" });
  exercicioAbdominal = await Exercicio.create({ equipe_id: equipeA.id, nome: "Abdominal" });
  exercicioDeB = await Exercicio.create({ equipe_id: equipeB.id, nome: "Exercício próprio de B" });
});

after(async () => {
  await FichaTreino.destroy({ where: { aluno_id: [alunoDeA.id, alunoDeB.id] } });
  await Exercicio.destroy({ where: { id: [exercicioSupino.id, exercicioAgachamento.id, exercicioAbdominal.id, exercicioDeB.id] } });
  await Aluno.destroy({ where: { id: [alunoDeA.id, alunoDeB.id] } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

test("criarNovaVersao: rejeita aluno de outra equipe", async () => {
  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeB.id, { grupos: [simples(exercicioSupino.id)] }),
    /Aluno não encontrado/
  );
});

test("criarNovaVersao: rejeita lista de grupos vazia", async () => {
  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { grupos: [] }),
    /grupos/
  );
});

test("criarNovaVersao: rejeita exercício de outra equipe", async () => {
  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { grupos: [simples(exercicioDeB.id)] }),
    /não existem, estão inativos, ou não pertencem/
  );
});

test("criarNovaVersao: rejeita exercício inativo (não pode entrar em ficha nova)", async (t) => {
  const inativo = await Exercicio.create({ equipe_id: equipeA.id, nome: "Exercício desativado", ativo: false });
  t.after(() => Exercicio.destroy({ where: { id: inativo.id } }));

  await assert.rejects(
    () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { grupos: [simples(inativo.id)] }),
    /inativos/
  );
});

test("criarNovaVersao: exercício desativado depois de já usado continua resolvendo normalmente em ficha antiga", async (t) => {
  const exercicio = await Exercicio.create({ equipe_id: equipeA.id, nome: "Exercício que será desativado" });
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { grupos: [simples(exercicio.id)] });
  t.after(async () => {
    await FichaTreino.destroy({ where: { id: ficha.id } });
    await Exercicio.destroy({ where: { id: exercicio.id } });
  });

  await exercicio.update({ ativo: false });

  const recarregada = await fichaTreinoService.obterDetalhe(equipeA.id, ficha.id);
  assert.equal(recarregada.grupos[0].itens[0].exercicio.id, exercicio.id);
  assert.equal(recarregada.grupos[0].itens[0].exercicio.ativo, false);
});

test("criarNovaVersao: cria a ficha com grupos simples (global + próprio) na ordem enviada", async (t) => {
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Treino A",
    grupos: [
      { tipo: "simples", series: 4, descanso: "90s", itens: [{ exercicioId: exercicioSupino.id, repeticoes: "8-12" }] },
      { tipo: "simples", series: 3, itens: [{ exercicioId: exercicioAgachamento.id, repeticoes: "10" }] }
    ]
  });
  t.after(() => FichaTreino.destroy({ where: { id: ficha.id } }));

  assert.equal(ficha.ativo, true);
  assert.equal(ficha.grupos.length, 2);
  assert.equal(ficha.grupos[0].ordem, 1);
  assert.equal(ficha.grupos[0].series, 4);
  assert.equal(ficha.grupos[0].descanso, "90s");
  assert.equal(ficha.grupos[0].itens[0].exercicio.id, exercicioSupino.id);
  assert.equal(ficha.grupos[0].itens[0].repeticoes, "8-12");
  assert.equal(ficha.grupos[1].ordem, 2);
});

test("criarNovaVersao: circuito guarda voltas e descanso no grupo e os exercícios na ordem", async (t) => {
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Circuito",
    grupos: [
      {
        tipo: "circuito",
        series: 2,
        descanso: "60s",
        observacoes: "Segunda volta com 10 repetições no supino",
        itens: [
          { exercicioId: exercicioSupino.id, repeticoes: "12", cargaObs: "20kg" },
          { exercicioId: exercicioAgachamento.id, repeticoes: "15" },
          { exercicioId: exercicioAbdominal.id, repeticoes: "30s" }
        ]
      }
    ]
  });
  t.after(() => FichaTreino.destroy({ where: { id: ficha.id } }));

  const [grupo] = ficha.grupos;
  assert.equal(grupo.tipo, "circuito");
  assert.equal(grupo.series, 2);
  assert.equal(grupo.descanso, "60s");
  assert.equal(grupo.observacoes, "Segunda volta com 10 repetições no supino");
  assert.deepEqual(
    grupo.itens.map((item) => [item.ordem, item.exercicio.id, item.repeticoes]),
    [
      [1, exercicioSupino.id, "12"],
      [2, exercicioAgachamento.id, "15"],
      [3, exercicioAbdominal.id, "30s"]
    ]
  );
});

test("criarNovaVersao: confere a quantidade de exercícios pelo tipo do grupo", async () => {
  const dois = [{ exercicioId: exercicioSupino.id }, { exercicioId: exercicioAgachamento.id }];
  const tres = [...dois, { exercicioId: exercicioAbdominal.id }];
  const casos = [
    { tipo: "simples", itens: dois },
    { tipo: "biset", itens: tres },
    { tipo: "triset", itens: dois },
    { tipo: "circuito", itens: [dois[0]] }
  ];
  for (const grupo of casos) {
    await assert.rejects(
      () => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { grupos: [grupo] }),
      /não pode ter/,
      `${grupo.tipo} com ${grupo.itens.length}`
    );
  }
});

test("criarNovaVersao: rejeita tipo desconhecido, séries inválidas e descanso longo demais", async () => {
  const criar = (grupo) => fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, { grupos: [grupo] });
  await assert.rejects(() => criar({ ...simples(exercicioSupino.id), tipo: "superset" }), /inválido/);
  await assert.rejects(() => criar(simples(exercicioSupino.id, { series: 0 })), /inteiro positivo/);
  await assert.rejects(() => criar(simples(exercicioSupino.id, { series: "2.5" })), /inteiro positivo/);
  await assert.rejects(() => criar(simples(exercicioSupino.id, { descanso: "x".repeat(31) })), /no máximo 30/);
});

test("criarNovaVersao: sem substituiFichaId, a ficha nova soma às ativas (divisão de treino)", async (t) => {
  const superiores = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Superiores",
    grupos: [simples(exercicioSupino.id)]
  });
  const inferiores = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Inferiores",
    grupos: [simples(exercicioAgachamento.id)]
  });
  t.after(() => FichaTreino.destroy({ where: { id: [inferiores.id, superiores.id] } }));

  const ativas = await fichaTreinoService.listarAtivas(equipeA.id, alunoDeA.id);
  assert.deepEqual(
    ativas.map((f) => f.nome),
    ["Inferiores", "Superiores"],
    "ativas em ordem de nome"
  );
});

test("criarNovaVersao: nova versão desativa só a ficha substituída, sem apagá-la (histórico preservado)", async (t) => {
  const inferiores = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Inferiores",
    grupos: [simples(exercicioAgachamento.id)]
  });
  const superiores = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Superiores",
    grupos: [simples(exercicioSupino.id)]
  });
  const superioresV2 = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    nome: "Superiores",
    substituiFichaId: superiores.id,
    grupos: [simples(exercicioAbdominal.id)]
  });
  t.after(() => FichaTreino.destroy({ where: { id: [inferiores.id, superiores.id, superioresV2.id] } }));

  assert.equal(superioresV2.substitui_id, superiores.id);

  const ativas = await fichaTreinoService.listarAtivas(equipeA.id, alunoDeA.id);
  assert.deepEqual(ativas.map((f) => f.id).sort(), [inferiores.id, superioresV2.id].sort());

  const antiga = await fichaTreinoService.obterDetalhe(equipeA.id, superiores.id);
  assert.equal(antiga.ativo, false);
  assert.equal(antiga.grupos[0].itens[0].exercicio.id, exercicioSupino.id, "itens da versão antiga continuam intactos");

  const historico = await fichaTreinoService.listarPorAluno(equipeA.id, alunoDeA.id);
  assert.deepEqual(
    historico.map((f) => f.id),
    [superioresV2.id, superiores.id, inferiores.id]
  );
});

test("criarNovaVersao: não substitui ficha já inativa nem de outro aluno", async (t) => {
  const outroAluno = await Aluno.create({ equipe_id: equipeA.id, nome: "Outro aluno de A" });
  const fichaDoOutro = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, outroAluno.id, {
    grupos: [simples(exercicioSupino.id)]
  });
  const original = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    grupos: [simples(exercicioSupino.id)]
  });
  const novaVersao = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    substituiFichaId: original.id,
    grupos: [simples(exercicioAgachamento.id)]
  });
  t.after(async () => {
    await FichaTreino.destroy({ where: { id: [fichaDoOutro.id, original.id, novaVersao.id] } });
    await Aluno.destroy({ where: { id: outroAluno.id } });
  });

  await assert.rejects(
    () =>
      fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
        substituiFichaId: original.id,
        grupos: [simples(exercicioAbdominal.id)]
      }),
    (err) => err.statusCode === 409
  );
  await assert.rejects(
    () =>
      fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
        substituiFichaId: fichaDoOutro.id,
        grupos: [simples(exercicioAbdominal.id)]
      }),
    /a substituir não encontrada/
  );

  const ativas = await fichaTreinoService.listarAtivas(equipeA.id, alunoDeA.id);
  assert.deepEqual(ativas.map((f) => f.id), [novaVersao.id], "tentativas rejeitadas não deixam ficha nova para trás");
});

test("criarNovaVersao: duas edições simultâneas da mesma ficha deixam uma só versão ativa", async (t) => {
  const original = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    grupos: [simples(exercicioSupino.id)]
  });
  t.after(() => FichaTreino.destroy({ where: { aluno_id: alunoDeA.id } }));

  const editar = (exercicioId) =>
    fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
      substituiFichaId: original.id,
      grupos: [simples(exercicioId)]
    });
  const resultados = await Promise.allSettled([editar(exercicioAgachamento.id), editar(exercicioAbdominal.id)]);

  assert.deepEqual(resultados.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(resultados.find((r) => r.status === "rejected").reason.statusCode, 409);
  const ativas = await fichaTreinoService.listarAtivas(equipeA.id, alunoDeA.id);
  assert.equal(ativas.length, 1);
});

test("arquivar: desliga a ficha sem substituta; arquivar de novo é conflito", async (t) => {
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    grupos: [simples(exercicioSupino.id)]
  });
  t.after(() => FichaTreino.destroy({ where: { id: ficha.id } }));

  const arquivada = await fichaTreinoService.arquivar(equipeA.id, ficha.id);
  assert.equal(arquivada.ativo, false);
  assert.equal(arquivada.grupos.length, 1, "continua no histórico, intacta");
  assert.deepEqual(await fichaTreinoService.listarAtivas(equipeA.id, alunoDeA.id), []);

  await assert.rejects(() => fichaTreinoService.arquivar(equipeA.id, ficha.id), (err) => err.statusCode === 409);
  await assert.rejects(() => fichaTreinoService.arquivar(equipeB.id, ficha.id), /não encontrada/);
});

test("listarAtivas: lista vazia quando o aluno não tem nenhuma ficha", async () => {
  const ativas = await fichaTreinoService.listarAtivas(equipeB.id, alunoDeB.id);
  assert.deepEqual(ativas, []);
});

test("obterDetalhe: rejeita ficha de outra equipe", async (t) => {
  const ficha = await fichaTreinoService.criarNovaVersao(equipeA.id, usuario.id, alunoDeA.id, {
    grupos: [simples(exercicioSupino.id)]
  });
  t.after(() => FichaTreino.destroy({ where: { id: ficha.id } }));

  await assert.rejects(() => fichaTreinoService.obterDetalhe(equipeB.id, ficha.id), /não encontrada/);
});
