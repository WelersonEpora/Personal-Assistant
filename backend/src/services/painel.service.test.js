"use strict";

// docs/adr/0017: resumo agregado do dashboard. Integração - toca o banco de
// teste. Cada teste monta a própria equipe para que os contadores e as
// listas (recortadas em 5) não sofram interferência de outros cenários.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  Usuario,
  Equipe,
  Aluno,
  Registro,
  ResultadoIa,
  Validacao,
  FichaTreino,
  FichaTreinoExercicio,
  Exercicio,
  AvaliacaoFisica,
  AvaliacaoMensal
} = require("../models");
const painelService = require("./painel.service");
const { mesReferenciaAnterior } = require("./avaliacao-mensal.service");

const DIA = 24 * 60 * 60 * 1000;
const anoMesCiclo = mesReferenciaAnterior(new Date());

let usuario;
const criados = {
  equipes: [],
  registros: [],
  alunos: [],
  fichas: [],
  exercicios: [],
  avaliacoesFisicas: [],
  avaliacoesMensais: []
};

function diasAtras(n) {
  return new Date(Date.now() - n * DIA);
}
function isoDia(date) {
  return date.toISOString().slice(0, 10);
}

async function novaEquipe() {
  const equipe = await Equipe.create({ nome: `Equipe Painel ${randomUUID()}` });
  criados.equipes.push(equipe.id);
  return equipe.id;
}

async function criarAluno(equipeId, props = {}) {
  const aluno = await Aluno.create({ equipe_id: equipeId, nome: `Aluno ${randomUUID().slice(0, 8)}`, ...props });
  criados.alunos.push(aluno.id);
  return aluno;
}

async function criarRelato({ aluno, status, iniciadoEm = new Date(), confirmadoEm = null }) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: aluno.equipe_id,
    aluno_id: aluno.id,
    iniciado_em: iniciadoEm,
    status
  });
  criados.registros.push(registro.id);
  if (confirmadoEm) {
    const resultado = await ResultadoIa.create({ registro_id: registro.id, payload_json: {}, status: "concluido" });
    await Validacao.create({
      registro_id: registro.id,
      resultado_ia_id: resultado.id,
      usuario_id: usuario.id,
      payload_confirmado_json: { itens: [] },
      confirmado_em: confirmadoEm
    });
  }
  return registro;
}

async function criarFicha(aluno, { ativo = true, criadaEm = new Date() } = {}) {
  const ficha = await FichaTreino.create({
    aluno_id: aluno.id,
    equipe_id: aluno.equipe_id,
    criado_por: usuario.id,
    ativo
  });
  // created_at é gerido pelo Sequelize (timestamps) - ajusta direto no banco
  // para simular uma ficha antiga.
  await FichaTreino.sequelize.query('UPDATE ficha_treino SET created_at = :quando WHERE id = :id', {
    replacements: { quando: criadaEm, id: ficha.id }
  });
  criados.fichas.push(ficha.id);
  return ficha;
}

async function criarAvaliacaoFisica(aluno, data, { criadaEm = null } = {}) {
  const av = await AvaliacaoFisica.create({
    aluno_id: aluno.id,
    equipe_id: aluno.equipe_id,
    data,
    origem: AvaliacaoFisica.ORIGENS.MANUAL
  });
  if (criadaEm) {
    await AvaliacaoFisica.sequelize.query('UPDATE avaliacao_fisica SET created_at = :quando WHERE id = :id', {
      replacements: { quando: criadaEm, id: av.id }
    });
  }
  criados.avaliacoesFisicas.push(av.id);
  return av;
}

async function criarAvaliacaoMensal(aluno, status, anoMes = anoMesCiclo) {
  const av = await AvaliacaoMensal.create({
    aluno_id: aluno.id,
    equipe_id: aluno.equipe_id,
    ano_mes: anoMes,
    periodo_inicio: `${anoMes}-01`,
    periodo_fim: `${anoMes}-28`,
    status,
    contexto_consolidado_json: {}
  });
  criados.avaliacoesMensais.push(av.id);
  return av;
}

before(async () => {
  usuario = await Usuario.create({ nome: "Personal Painel", email: `painel-${randomUUID()}@ex.com`, senha_hash: "h" });
});

after(async () => {
  await Validacao.destroy({ where: { registro_id: criados.registros } });
  await ResultadoIa.destroy({ where: { registro_id: criados.registros } });
  await Registro.destroy({ where: { id: criados.registros } });
  await FichaTreinoExercicio.destroy({ where: { ficha_treino_id: criados.fichas } });
  await FichaTreino.destroy({ where: { id: criados.fichas } });
  await AvaliacaoFisica.destroy({ where: { id: criados.avaliacoesFisicas } });
  await AvaliacaoMensal.destroy({ where: { id: criados.avaliacoesMensais } });
  await Exercicio.destroy({ where: { id: criados.exercicios } });
  await Aluno.destroy({ where: { id: criados.alunos } });
  await Equipe.destroy({ where: { id: criados.equipes } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

test("resumo: conta alunos ativos/total, ignora inativos e outra equipe", async () => {
  const equipeId = await novaEquipe();
  await criarAluno(equipeId);
  await criarAluno(equipeId);
  await criarAluno(equipeId, { ativo: false });
  await criarAluno(await novaEquipe()); // outra equipe

  const painel = await painelService.obterPainel(equipeId);
  assert.equal(painel.resumo.alunos_ativos, 2);
  assert.equal(painel.resumo.alunos_total, 3);
});

test("resumo: relatos confirmados 7d/30d (por confirmado_em), capturados 30d e em processamento", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  await criarRelato({ aluno, status: Registro.STATUS.CONFIRMADO, confirmadoEm: diasAtras(3) });
  await criarRelato({ aluno, status: Registro.STATUS.CONFIRMADO, confirmadoEm: diasAtras(20) });
  await criarRelato({ aluno, status: Registro.STATUS.CONFIRMADO, confirmadoEm: diasAtras(200) });
  await criarRelato({ aluno, status: Registro.STATUS.TRANSCREVENDO });

  const painel = await painelService.obterPainel(equipeId);
  assert.equal(painel.resumo.relatos_confirmados_7d, 1);
  assert.equal(painel.resumo.relatos_confirmados_30d, 2);
  assert.equal(painel.resumo.relatos_capturados_30d, 4); // todos criados agora
  assert.equal(painel.resumo.em_processamento, 1);
});

test("panorama: sem ficha ativa lista só quem não tem ficha ativa", async () => {
  const equipeId = await novaEquipe();
  await criarAluno(equipeId, { nome: "Sem Ficha" });
  const comFicha = await criarAluno(equipeId, { nome: "Com Ficha" });
  await criarFicha(comFicha);

  const painel = await painelService.obterPainel(equipeId);
  const nomes = painel.panorama.sem_ficha_ativa.itens.map((a) => a.nome);
  assert.deepEqual(nomes, ["Sem Ficha"]);
});

test("panorama: aluno que não usa ficha de treino fica fora de 'sem ficha' e 'ficha antiga'", async () => {
  const equipeId = await novaEquipe();
  await criarAluno(equipeId, { nome: "Dispensado Sem Ficha", dispensa_ficha_treino: true });
  const dispensadoComFichaVelha = await criarAluno(equipeId, { nome: "Dispensado Ficha Velha", dispensa_ficha_treino: true });
  await criarFicha(dispensadoComFichaVelha, { criadaEm: diasAtras(70) });
  await criarAluno(equipeId, { nome: "Normal Sem Ficha" });

  const painel = await painelService.obterPainel(equipeId);
  assert.deepEqual(painel.panorama.sem_ficha_ativa.itens.map((a) => a.nome), ["Normal Sem Ficha"]);
  assert.equal(painel.panorama.ficha_antiga.itens.length, 0);
})

test("panorama: ficha antiga (> 8 semanas) e avaliação física vencida (> 90 dias)", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId, { nome: "Ficha Velha" });
  await criarFicha(aluno, { criadaEm: diasAtras(70) });
  await criarAvaliacaoFisica(aluno, isoDia(diasAtras(120)));

  const painel = await painelService.obterPainel(equipeId);
  assert.deepEqual(painel.panorama.ficha_antiga.itens.map((a) => a.nome), ["Ficha Velha"]);
  assert.deepEqual(painel.panorama.avaliacao_fisica_vencida.itens.map((a) => a.nome), ["Ficha Velha"]);
});

test("panorama: aluno que não faz avaliação física fica fora de 'avaliação vencida'", async () => {
  const equipeId = await novaEquipe();
  await criarAluno(equipeId, { nome: "Dispensado Aval", dispensa_avaliacao_fisica: true });
  const dispensadoComAval = await criarAluno(equipeId, { nome: "Dispensado Aval Velha", dispensa_avaliacao_fisica: true });
  await criarAvaliacaoFisica(dispensadoComAval, isoDia(diasAtras(400)));
  await criarAluno(equipeId, { nome: "Normal Sem Aval" });

  const painel = await painelService.obterPainel(equipeId);
  assert.deepEqual(painel.panorama.avaliacao_fisica_vencida.itens.map((a) => a.nome), ["Normal Sem Aval"]);
})

test("panorama: ficha recente e avaliação física recente NÃO entram", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId, { nome: "Em Dia" });
  await criarFicha(aluno, { criadaEm: diasAtras(10) });
  await criarAvaliacaoFisica(aluno, isoDia(diasAtras(10)));

  const painel = await painelService.obterPainel(equipeId);
  assert.equal(painel.panorama.ficha_antiga.itens.length, 0);
  assert.equal(painel.panorama.avaliacao_fisica_vencida.itens.length, 0);
});

test("panorama: aniversariantes dentro de 30 dias, ordenados pelo mais próximo", async () => {
  const equipeId = await novaEquipe();
  const hoje = new Date();
  const em5 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 5);
  const em40 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 40);
  const mmdd = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await criarAluno(equipeId, { nome: "Perto", data_nascimento: `1990-${mmdd(em5)}` });
  await criarAluno(equipeId, { nome: "Longe", data_nascimento: `1990-${mmdd(em40)}` });

  const painel = await painelService.obterPainel(equipeId);
  assert.deepEqual(painel.panorama.aniversariantes.itens.map((a) => a.nome), ["Perto"]);
});

test("acao_necessaria: sem relato recente = acompanhamento interrompido (não conta quem nunca teve relato)", async () => {
  const equipeId = await novaEquipe();
  const parado = await criarAluno(equipeId, { nome: "Parado" });
  await criarRelato({ aluno: parado, status: Registro.STATUS.CONFIRMADO, iniciadoEm: diasAtras(40) });
  const emDia = await criarAluno(equipeId, { nome: "Em Dia" });
  await criarRelato({ aluno: emDia, status: Registro.STATUS.CONFIRMADO, iniciadoEm: diasAtras(2) });
  await criarAluno(equipeId, { nome: "Nunca" });

  const painel = await painelService.obterPainel(equipeId);
  const nomes = painel.acao_necessaria.alunos_sem_relato.itens.map((a) => a.nome);
  assert.deepEqual(nomes, ["Parado"]);
});

test("acao_necessaria: relatos aguardando revisão e com erro; pendentes_revisao bate", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  await criarRelato({ aluno, status: Registro.STATUS.AGUARDANDO_REVISAO });
  await criarRelato({ aluno, status: Registro.STATUS.AGUARDANDO_REVISAO });
  await criarRelato({ aluno, status: Registro.STATUS.ERRO_INTERPRETACAO });

  const painel = await painelService.obterPainel(equipeId);
  assert.equal(painel.acao_necessaria.relatos_aguardando_revisao.total, 2);
  assert.equal(painel.acao_necessaria.relatos_com_erro.total, 1);
  assert.equal(painel.pendentes_revisao, 2);
});

test("ciclo_mensal: distribui status e calcula pendentes = ativos - processados", async () => {
  const equipeId = await novaEquipe();
  const a1 = await criarAluno(equipeId);
  const a2 = await criarAluno(equipeId);
  await criarAluno(equipeId); // ativo, sem avaliação mensal -> pendente
  await criarAvaliacaoMensal(a1, AvaliacaoMensal.STATUS.GERADA);
  await criarAvaliacaoMensal(a2, AvaliacaoMensal.STATUS.FALHA);

  const painel = await painelService.obterPainel(equipeId);
  const ciclo = painel.resumo.ciclo_mensal;
  assert.equal(ciclo.ano_mes, anoMesCiclo);
  assert.equal(ciclo.gerados, 1);
  assert.equal(ciclo.falha, 1);
  assert.equal(ciclo.dados_insuficientes, 0);
  assert.equal(ciclo.pendentes, 1);
  assert.equal(painel.acao_necessaria.avaliacoes_mensais_falha.total, 1);
});

test("atividade_recente: mescla fontes e ordena por data desc", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId, { nome: "Feed" });
  await criarFicha(aluno);
  await criarRelato({ aluno, status: Registro.STATUS.RECEBIDO });
  await criarAvaliacaoFisica(aluno, isoDia(new Date()));

  const painel = await painelService.obterPainel(equipeId);
  const tipos = new Set(painel.atividade_recente.map((e) => e.tipo));
  assert.ok(tipos.has("relato"));
  assert.ok(tipos.has("avaliacao_fisica"));
  assert.ok(tipos.has("ficha_treino"));
  const datas = painel.atividade_recente.map((e) => new Date(e.quando).getTime());
  assert.deepEqual(datas, [...datas].sort((x, y) => y - x));
});

test("atividade_recente: lançamento com mais de 30 dias não aparece", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId, { nome: "Feed Janela" });
  await criarAvaliacaoFisica(aluno, isoDia(diasAtras(400)), { criadaEm: diasAtras(40) });
  await criarAvaliacaoFisica(aluno, isoDia(new Date()));

  const painel = await painelService.obterPainel(equipeId);
  assert.equal(painel.atividade_recente.filter((e) => e.tipo === "avaliacao_fisica").length, 1);
});

test("atividade_recente: no máximo 4 itens por tipo (um lote não domina o feed)", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId, { nome: "Feed Lote" });
  for (let i = 0; i < 6; i += 1) await criarAvaliacaoFisica(aluno, isoDia(diasAtras(i)));
  await criarRelato({ aluno, status: Registro.STATUS.RECEBIDO });

  const painel = await painelService.obterPainel(equipeId);
  assert.equal(painel.atividade_recente.filter((e) => e.tipo === "avaliacao_fisica").length, 4);
  assert.ok(painel.atividade_recente.some((e) => e.tipo === "relato"));
});

test("catalogo: conta exercícios visíveis (globais + próprios) e fichas ativas da equipe", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  await criarFicha(aluno);
  const proprio = await Exercicio.create({ equipe_id: equipeId, nome: "Agachamento Próprio" });
  criados.exercicios.push(proprio.id);
  const inativo = await Exercicio.create({ equipe_id: equipeId, nome: "Inativo", ativo: false });
  criados.exercicios.push(inativo.id);

  const painel = await painelService.obterPainel(equipeId);
  // pelo menos o próprio ativo; o inativo não conta
  assert.ok(painel.catalogo.exercicios >= 1);
  assert.equal(painel.catalogo.fichas_ativas, 1);
});

test("isolamento: painel de uma equipe não enxerga dados de outra", async () => {
  const equipeA = await novaEquipe();
  const equipeB = await novaEquipe();
  const alunoA = await criarAluno(equipeA);
  await criarRelato({ aluno: alunoA, status: Registro.STATUS.AGUARDANDO_REVISAO });

  const painelB = await painelService.obterPainel(equipeB);
  assert.equal(painelB.resumo.alunos_total, 0);
  assert.equal(painelB.acao_necessaria.relatos_aguardando_revisao.total, 0);
  assert.equal(painelB.atividade_recente.length, 0);
});
