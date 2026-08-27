"use strict";

// docs/adr/0015: análise sob demanda. Integração - toca o banco de teste; a
// chamada ao Gemini é mockada. Cobre: limite de 1 a cada 7 dias (só análise
// GERADA conta), dados insuficientes sem chamar a IA, uso do contexto mensal
// só como referência, e o registro de data/hora + aluno + solicitante.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  Usuario,
  Equipe,
  Aluno,
  Registro,
  RegistroEntrada,
  ResultadoIa,
  Validacao,
  AvaliacaoMensal,
  AnaliseSobDemanda
} = require("../models");
const geminiService = require("./ia/gemini.service");
const analiseSobDemandaService = require("./analise-sob-demanda.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;

const ANALISE_FAKE = {
  analise: {
    dados_insuficientes: false,
    relatos_considerados: 1,
    resumo_geral: "Momento de manutenção.",
    dimensoes: [],
    destaques: [],
    alertas: [],
    recomendacoes: [],
    pendencias_confirmacao: []
  }
};

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `t-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipe = await Equipe.create({ nome: `Equipe ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno de Teste" });
});

after(async () => {
  await AnaliseSobDemanda.destroy({ where: { aluno_id: aluno.id } });
  await AvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
  await Aluno.destroy({ where: { id: aluno.id } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

async function limpar() {
  await AnaliseSobDemanda.destroy({ where: { aluno_id: aluno.id } });
  await AvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
  const registros = await Registro.findAll({ where: { aluno_id: aluno.id } });
  const ids = registros.map((r) => r.id);
  await Validacao.destroy({ where: { registro_id: ids } });
  await RegistroEntrada.destroy({ where: { registro_id: ids } });
  await ResultadoIa.destroy({ where: { registro_id: ids } });
  await Registro.destroy({ where: { id: ids } });
}

async function criarRelatoConfirmado(confirmadoEm) {
  const itens = [{ label: "Agachamento", valor: "4x10", obs: "" }];
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: confirmadoEm,
    finalizado_em: confirmadoEm,
    status: Registro.STATUS.CONFIRMADO
  });
  await RegistroEntrada.create({ registro_id: registro.id, ordem: 0, tipo: "texto", conteudo_texto: "relato" });
  const resultado = await ResultadoIa.create({ registro_id: registro.id, payload_json: { itens }, status: "concluido" });
  await Validacao.create({
    registro_id: registro.id,
    resultado_ia_id: resultado.id,
    usuario_id: usuario.id,
    payload_confirmado_json: { itens, notaGeral: "" },
    confirmado_em: confirmadoEm
  });
  return registro;
}

test("sem relatos recentes: não chama a IA, NÃO registra nada e NÃO consome a janela de 7 dias", async (t) => {
  const spy = t.mock.method(geminiService, "gerarAnaliseSobDemanda");
  t.after(limpar);

  const resultado = await analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id });

  assert.equal(resultado.status, "dados_insuficientes");
  assert.equal(resultado.persistida, false);
  assert.match(resultado.mensagem, /nada foi consumido/i);
  assert.equal(spy.mock.callCount(), 0);

  // nada persistido
  assert.equal(await AnaliseSobDemanda.count({ where: { aluno_id: aluno.id } }), 0);

  // pode tentar de novo na hora
  const disp = await analiseSobDemandaService.disponibilidade({ alunoId: aluno.id });
  assert.equal(disp.disponivel_agora, true);
});

test("IA julga dados insuficientes: NÃO registra e NÃO consome a janela (só a mensagem da IA)", async (t) => {
  t.mock.method(geminiService, "gerarAnaliseSobDemanda", async () => ({
    analise: { dados_insuficientes: true, relatos_considerados: 1, resumo_geral: "Um único relato não permite conclusão.", dimensoes: [] }
  }));
  await criarRelatoConfirmado(new Date());
  t.after(limpar);

  const resultado = await analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id });

  assert.equal(resultado.persistida, false);
  assert.match(resultado.mensagem, /não permite conclusão/i);
  assert.equal(await AnaliseSobDemanda.count({ where: { aluno_id: aluno.id } }), 0);

  const disp = await analiseSobDemandaService.disponibilidade({ alunoId: aluno.id });
  assert.equal(disp.disponivel_agora, true);
});

test("com relatos recentes: chama a IA, grava 'gerada' e registra o solicitante", async (t) => {
  t.mock.method(geminiService, "gerarAnaliseSobDemanda", async () => ANALISE_FAKE);
  await criarRelatoConfirmado(new Date());
  t.after(limpar);

  const analise = await analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id });

  assert.equal(analise.status, "gerada");
  assert.equal(analise.relatos_considerados, 1);
  assert.equal(analise.analise_json.resumo_geral, "Momento de manutenção.");
  assert.equal(analise.baseada_em_registro_ids.length, 1);
});

test("limite: segunda solicitação dentro de 7 dias é rejeitada com 409 e não cria linha nova", async (t) => {
  t.mock.method(geminiService, "gerarAnaliseSobDemanda", async () => ANALISE_FAKE);
  await criarRelatoConfirmado(new Date());
  t.after(limpar);

  await analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id });

  await assert.rejects(
    () => analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.ok(err.details.proxima_disponivel_em);
      return true;
    }
  );

  const total = await AnaliseSobDemanda.count({ where: { aluno_id: aluno.id } });
  assert.equal(total, 1);

  const disp = await analiseSobDemandaService.disponibilidade({ alunoId: aluno.id });
  assert.equal(disp.disponivel_agora, false);
  assert.ok(disp.proxima_disponivel_em);
});

test("limite: uma análise gerada há mais de 7 dias libera nova solicitação", async (t) => {
  t.mock.method(geminiService, "gerarAnaliseSobDemanda", async () => ANALISE_FAKE);
  await criarRelatoConfirmado(new Date());
  await AnaliseSobDemanda.create({
    aluno_id: aluno.id,
    equipe_id: equipe.id,
    solicitada_por: usuario.id,
    solicitada_em: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    status: "gerada",
    relatos_considerados: 3,
    baseada_em_registro_ids: [],
    analise_json: {}
  });
  t.after(limpar);

  const analise = await analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id });
  assert.equal(analise.status, "gerada");
});

test("uma 'falha' anterior (recente) NÃO bloqueia nova solicitação", async (t) => {
  t.mock.method(geminiService, "gerarAnaliseSobDemanda", async () => ANALISE_FAKE);
  await AnaliseSobDemanda.create({
    aluno_id: aluno.id,
    equipe_id: equipe.id,
    solicitada_por: usuario.id,
    solicitada_em: new Date(),
    status: "falha",
    relatos_considerados: 2,
    baseada_em_registro_ids: [],
    erro: "Gemini fora do ar",
    analise_json: null
  });
  await criarRelatoConfirmado(new Date());
  t.after(limpar);

  const analise = await analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id });
  assert.equal(analise.status, "gerada");
});

test("usa o contexto consolidado mensal apenas como referência (contexto_referencia_id) - não o altera", async (t) => {
  const mensal = await AvaliacaoMensal.create({
    aluno_id: aluno.id,
    equipe_id: equipe.id,
    ano_mes: "2026-05",
    periodo_inicio: "2026-05-01",
    periodo_fim: "2026-05-31",
    status: "gerada",
    origem: "manual",
    relatos_considerados: 6,
    baseada_em_registro_ids: [],
    avaliacao_json: {},
    contexto_consolidado_json: {
      aluno_id: aluno.id,
      cobre_ate: "2026-05",
      gerado_em: "2026-06-01",
      linha_de_base: [{ rotulo: "Objetivo", valor: "corrida de 10k", tipo: "fato" }],
      estado_atual: [],
      evolucao_relevante: [],
      marcos: [],
      hipoteses_abertas: [],
      lacunas: []
    }
  });

  let promptRecebido = null;
  t.mock.method(geminiService, "gerarAnaliseSobDemanda", async ({ promptContexto }) => {
    promptRecebido = promptContexto;
    return ANALISE_FAKE;
  });
  await criarRelatoConfirmado(new Date());
  t.after(limpar);

  const analise = await analiseSobDemandaService.solicitar({ equipeId: equipe.id, alunoId: aluno.id, usuarioId: usuario.id });

  assert.equal(analise.contexto_referencia_id, mensal.id);
  assert.match(promptRecebido, /corrida de 10k/);

  const mensalDepois = await AvaliacaoMensal.findByPk(mensal.id);
  assert.deepEqual(mensalDepois.contexto_consolidado_json.linha_de_base, [{ rotulo: "Objetivo", valor: "corrida de 10k", tipo: "fato" }]);
});

test("rejeita aluno de outra equipe", async () => {
  await assert.rejects(
    () => analiseSobDemandaService.solicitar({ equipeId: outraEquipe.id, alunoId: aluno.id, usuarioId: usuario.id }),
    /não encontrado/
  );
});
