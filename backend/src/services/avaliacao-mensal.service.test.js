"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md. Integração - toca o
// banco de teste; a chamada ao Gemini é mockada. Cobre as garantias
// críticas: gatilho mínimo de 5 relatos, filtro por mês de confirmação,
// contexto do mês anterior como entrada, regeneração idempotente e - o mais
// importante - a avaliação mensal NUNCA cria dado oficial (`validacao`).

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  sequelize,
  Usuario,
  Equipe,
  Aluno,
  Registro,
  RegistroEntrada,
  ResultadoIa,
  Validacao,
  AvaliacaoMensal,
  AvaliacaoPersonal
} = require("../models");
const geminiService = require("./ia/gemini.service");
const avaliacaoMensalService = require("./avaliacao-mensal.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;

const RESPOSTA_IA_FAKE = {
  avaliacaoMensal: {
    periodo: { ano_mes: "0000-00" },
    dados_insuficientes: false,
    relatos_considerados: 5,
    resumo_geral: "Evolução consistente.",
    dimensoes: []
  },
  contextoConsolidado: {
    aluno_id: "placeholder",
    gerado_em: "2026-01-01",
    cobre_ate: "0000-00",
    linha_de_base: [],
    estado_atual: [],
    evolucao_relevante: [],
    marcos: [],
    hipoteses_abertas: [],
    lacunas: []
  }
};

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `t-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipe = await Equipe.create({ nome: `Equipe ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno de Teste" });
});

after(async () => {
  await AvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
  await Aluno.destroy({ where: { id: aluno.id } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

async function limpar() {
  await AvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
  await AvaliacaoPersonal.destroy({ where: { aluno_id: aluno.id } });
  const registros = await Registro.findAll({ where: { aluno_id: aluno.id } });
  const ids = registros.map((r) => r.id);
  await Validacao.destroy({ where: { registro_id: ids } });
  await RegistroEntrada.destroy({ where: { registro_id: ids } });
  await ResultadoIa.destroy({ where: { registro_id: ids } });
  await Registro.destroy({ where: { id: ids } });
}

async function criarAvaliacaoPersonal(texto, quando = new Date()) {
  const avaliacao = await AvaliacaoPersonal.create({ aluno_id: aluno.id, equipe_id: equipe.id, autor_id: usuario.id, texto });
  // Sequelize ignora created_at em .update() - força via SQL para o teste
  // conseguir posicionar a nota num mês específico.
  await sequelize.query("UPDATE avaliacao_personal SET created_at = :quando WHERE id = :id", {
    replacements: { quando, id: avaliacao.id }
  });
  return avaliacao;
}

async function criarRelatoConfirmado(confirmadoEm, itens = [{ label: "Agachamento", valor: "4x10", obs: "" }]) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: confirmadoEm,
    finalizado_em: confirmadoEm,
    data_atendimento: new Date(confirmadoEm).toISOString().slice(0, 10),
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

test("menos de 5 relatos confirmados: registra dados_insuficientes e NÃO chama a IA", async (t) => {
  const spy = t.mock.method(geminiService, "gerarAvaliacaoMensal");
  for (let i = 0; i < 4; i += 1) await criarRelatoConfirmado(new Date(2026, 2, 5 + i));
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-03" });

  assert.equal(avaliacao.status, "dados_insuficientes");
  assert.equal(avaliacao.relatos_considerados, 4);
  assert.equal(avaliacao.avaliacao_json.dados_insuficientes, true);
  assert.equal(avaliacao.modelo, null);
  assert.equal(spy.mock.callCount(), 0);
});

test("0 relatos no mês: dados_insuficientes com contexto vazio, sem IA", async (t) => {
  const spy = t.mock.method(geminiService, "gerarAvaliacaoMensal");
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-03" });

  assert.equal(avaliacao.status, "dados_insuficientes");
  assert.equal(avaliacao.relatos_considerados, 0);
  assert.deepEqual(avaliacao.contexto_consolidado_json.linha_de_base, []);
  assert.equal(spy.mock.callCount(), 0);
});

test("geração MANUAL com menos de 5 relatos: NÃO persiste linha, devolve aviso e não chama a IA", async (t) => {
  const spy = t.mock.method(geminiService, "gerarAvaliacaoMensal");
  for (let i = 0; i < 3; i += 1) await criarRelatoConfirmado(new Date(2026, 2, 5 + i));
  t.after(limpar);

  const resultado = await avaliacaoMensalService.gerarParaAluno({
    equipeId: equipe.id,
    alunoId: aluno.id,
    anoMes: "2026-03",
    origem: "manual"
  });

  assert.equal(resultado.persistida, false);
  assert.equal(resultado.relatos_considerados, 3);
  assert.match(resultado.mensagem, /mínimo/i);
  assert.equal(spy.mock.callCount(), 0);

  const linhas = await AvaliacaoMensal.findAll({ where: { aluno_id: aluno.id, ano_mes: "2026-03" } });
  assert.equal(linhas.length, 0);
});

test("geração MANUAL insuficiente não altera uma avaliação já existente do mês", async (t) => {
  const spy = t.mock.method(geminiService, "gerarAvaliacaoMensal");
  await AvaliacaoMensal.create({
    aluno_id: aluno.id,
    equipe_id: equipe.id,
    ano_mes: "2026-03",
    periodo_inicio: "2026-03-01",
    periodo_fim: "2026-03-31",
    status: "gerada",
    origem: "manual",
    relatos_considerados: 6,
    baseada_em_registro_ids: [],
    avaliacao_json: { resumo_geral: "avaliação anterior" },
    contexto_consolidado_json: { aluno_id: aluno.id }
  });
  for (let i = 0; i < 2; i += 1) await criarRelatoConfirmado(new Date(2026, 2, 5 + i));
  t.after(limpar);

  const resultado = await avaliacaoMensalService.gerarParaAluno({
    equipeId: equipe.id,
    alunoId: aluno.id,
    anoMes: "2026-03",
    origem: "manual"
  });

  assert.equal(resultado.persistida, false);
  assert.equal(spy.mock.callCount(), 0);

  const linha = await AvaliacaoMensal.findOne({ where: { aluno_id: aluno.id, ano_mes: "2026-03" } });
  assert.equal(linha.status, "gerada");
  assert.equal(linha.avaliacao_json.resumo_geral, "avaliação anterior");
});

test("job (origem automatica) com menos de 5 relatos continua gravando dados_insuficientes", async (t) => {
  const spy = t.mock.method(geminiService, "gerarAvaliacaoMensal");
  for (let i = 0; i < 3; i += 1) await criarRelatoConfirmado(new Date(2026, 2, 5 + i));
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({
    equipeId: equipe.id,
    alunoId: aluno.id,
    anoMes: "2026-03",
    origem: "automatica"
  });

  assert.equal(avaliacao.status, "dados_insuficientes");
  assert.equal(avaliacao.relatos_considerados, 3);
  assert.equal(spy.mock.callCount(), 0);
});

test("5+ relatos: chama a IA e persiste avaliação + contexto (aluno_id e cobre_ate normalizados)", async (t) => {
  t.mock.method(geminiService, "gerarAvaliacaoMensal", async () => RESPOSTA_IA_FAKE);
  for (let i = 0; i < 5; i += 1) await criarRelatoConfirmado(new Date(2026, 3, 4 + i));
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04" });

  assert.equal(avaliacao.status, "gerada");
  assert.equal(avaliacao.relatos_considerados, 5);
  assert.equal(avaliacao.baseada_em_registro_ids.length, 5);
  assert.equal(avaliacao.contexto_consolidado_json.aluno_id, aluno.id);
  assert.equal(avaliacao.contexto_consolidado_json.cobre_ate, "2026-04");
});

test("a avaliação mensal NUNCA cria uma Validacao (não é dado oficial)", async (t) => {
  t.mock.method(geminiService, "gerarAvaliacaoMensal", async () => RESPOSTA_IA_FAKE);
  for (let i = 0; i < 5; i += 1) await criarRelatoConfirmado(new Date(2026, 3, 4 + i));
  t.after(limpar);

  // Escopado a este aluno - o banco de teste é compartilhado entre arquivos.
  const contar = () =>
    Validacao.count({ include: [{ model: Registro, as: "registro", required: true, where: { aluno_id: aluno.id } }] });

  const antes = await contar();
  await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04" });
  await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04" });
  const depois = await contar();

  assert.equal(antes, 5);
  assert.equal(depois, antes);
});

test("relatos são filtrados pelo mês de CONFIRMAÇÃO (confirmado_em), não pela data da sessão", async (t) => {
  t.mock.method(geminiService, "gerarAvaliacaoMensal", async () => RESPOSTA_IA_FAKE);
  for (let i = 0; i < 3; i += 1) await criarRelatoConfirmado(new Date(2026, 6, 10 + i)); // julho
  for (let i = 0; i < 2; i += 1) await criarRelatoConfirmado(new Date(2026, 7, 1 + i)); // agosto
  t.after(limpar);

  const julho = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-07" });
  assert.equal(julho.relatos_considerados, 3);
  assert.equal(julho.status, "dados_insuficientes");
});

test("usa o contexto consolidado do mês anterior como entrada da IA", async (t) => {
  await AvaliacaoMensal.create({
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
      gerado_em: "2026-06-01",
      cobre_ate: "2026-05",
      linha_de_base: [{ rotulo: "Objetivo", valor: "hipertrofia com foco em membros inferiores", tipo: "fato" }],
      estado_atual: [],
      evolucao_relevante: [],
      marcos: [],
      hipoteses_abertas: [],
      lacunas: []
    }
  });

  let promptRecebido = null;
  t.mock.method(geminiService, "gerarAvaliacaoMensal", async ({ promptContexto }) => {
    promptRecebido = promptContexto;
    return RESPOSTA_IA_FAKE;
  });
  for (let i = 0; i < 5; i += 1) await criarRelatoConfirmado(new Date(2026, 5, 4 + i));
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-06" });

  assert.match(promptRecebido, /hipertrofia com foco em membros inferiores/);
  assert.ok(avaliacao.contexto_anterior_id);
});

test("regeneração é idempotente: sobrescreve a linha do mês, não acumula", async (t) => {
  t.mock.method(geminiService, "gerarAvaliacaoMensal", async () => RESPOSTA_IA_FAKE);
  for (let i = 0; i < 5; i += 1) await criarRelatoConfirmado(new Date(2026, 3, 4 + i));
  t.after(limpar);

  await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04", origem: "automatica" });
  await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04", origem: "manual" });

  const linhas = await AvaliacaoMensal.findAll({ where: { aluno_id: aluno.id, ano_mes: "2026-04" } });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].origem, "manual");
});

test("falha da IA: registra status 'falha' com o erro e carrega o contexto anterior adiante", async (t) => {
  t.mock.method(geminiService, "gerarAvaliacaoMensal", async () => {
    throw new Error("Gemini fora do ar");
  });
  for (let i = 0; i < 5; i += 1) await criarRelatoConfirmado(new Date(2026, 3, 4 + i));
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04" });

  assert.equal(avaliacao.status, "falha");
  assert.match(avaliacao.erro, /fora do ar/);
  assert.equal(avaliacao.avaliacao_json, null);
  assert.equal(avaliacao.contexto_consolidado_json.cobre_ate, "2026-04");
});

test("inclui a avaliação do personal do mês no prompt e registra os ids em avaliacoes_personal_consideradas", async (t) => {
  let promptRecebido = null;
  t.mock.method(geminiService, "gerarAvaliacaoMensal", async ({ promptContexto }) => {
    promptRecebido = promptContexto;
    return RESPOSTA_IA_FAKE;
  });
  for (let i = 0; i < 5; i += 1) await criarRelatoConfirmado(new Date(2026, 3, 4 + i));
  const nota = await criarAvaliacaoPersonal("Aluno relatou dormir melhor; percebi mais disposição.", new Date(2026, 3, 10));
  // uma nota fora do mês não deve entrar
  await criarAvaliacaoPersonal("nota de maio", new Date(2026, 4, 2));
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04" });

  assert.match(promptRecebido, /AVALIAÇÃO DO PERSONAL/);
  assert.match(promptRecebido, /dormir melhor/);
  assert.doesNotMatch(promptRecebido, /nota de maio/);
  assert.deepEqual(avaliacao.avaliacoes_personal_consideradas, [nota.id]);
});

test("mês 'dados insuficientes' não envia a avaliação do personal e não a marca como considerada", async (t) => {
  const spy = t.mock.method(geminiService, "gerarAvaliacaoMensal");
  await criarRelatoConfirmado(new Date(2026, 3, 5));
  await criarAvaliacaoPersonal("minha leitura do mês", new Date(2026, 3, 10));
  t.after(limpar);

  const avaliacao = await avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026-04" });

  assert.equal(avaliacao.status, "dados_insuficientes");
  assert.equal(spy.mock.callCount(), 0);
  assert.deepEqual(avaliacao.avaliacoes_personal_consideradas, []);
});

test("rejeita mês em formato inválido", async () => {
  await assert.rejects(
    () => avaliacaoMensalService.gerarParaAluno({ equipeId: equipe.id, alunoId: aluno.id, anoMes: "2026/04" }),
    /YYYY-MM/
  );
});

test("rejeita aluno de outra equipe", async () => {
  await assert.rejects(
    () => avaliacaoMensalService.gerarParaAluno({ equipeId: outraEquipe.id, alunoId: aluno.id, anoMes: "2026-04" }),
    /não encontrado/
  );
});
