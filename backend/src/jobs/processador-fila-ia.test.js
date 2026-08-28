"use strict";

// montarContextoConsolidado: função pura que monta o contexto enviado à IA
// (docs/adr/0006) - preserva a ordem original de captura (docs/adr/0002) mesmo
// com texto e áudio intercalados, e nunca quebra sem transcrição.
//
// processarRegistro: o fork por `registro.tipo` (docs/adr/0018) - avaliação
// física vai para proposta_avaliacao_fisica e NUNCA toca resultado_ia.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Registro, RegistroEntrada, ResultadoIa, PropostaAvaliacaoFisica } = require("../models");
const geminiService = require("../services/ia/gemini.service");
const { montarContextoConsolidado, processarRegistro } = require("./processador-fila-ia");

test("montarContextoConsolidado: preserva a ordem de captura, não a ordem de inserção", () => {
  const entradas = [
    { ordem: 1, tipo: "texto", conteudo_texto: "Segunda entrada." },
    { ordem: 0, tipo: "texto", conteudo_texto: "Primeira entrada." },
    { ordem: 2, tipo: "texto", conteudo_texto: "Terceira entrada." }
  ];

  const contexto = montarContextoConsolidado(entradas);
  const linhas = contexto.split("\n");
  assert.match(linhas[0], /Primeira entrada/);
  assert.match(linhas[1], /Segunda entrada/);
  assert.match(linhas[2], /Terceira entrada/);
});

test("montarContextoConsolidado: usa o texto transcrito de cada áudio", () => {
  const entradas = [
    {
      ordem: 0,
      tipo: "audio",
      arquivoAudio: { transcricao: { texto: "Agachamento quatro por dez." } }
    }
  ];
  const contexto = montarContextoConsolidado(entradas);
  assert.match(contexto, /Agachamento quatro por dez\./);
});

test("montarContextoConsolidado: entrada de áudio sem transcrição não quebra e fica marcada", () => {
  const entradas = [{ ordem: 0, tipo: "audio", arquivoAudio: { transcricao: null } }];
  const contexto = montarContextoConsolidado(entradas);
  assert.match(contexto, /transcrição indisponível/);
});

test("montarContextoConsolidado: mistura texto e áudio na ordem correta", () => {
  const entradas = [
    { ordem: 2, tipo: "texto", conteudo_texto: "Aumentar carga." },
    { ordem: 0, tipo: "audio", arquivoAudio: { transcricao: { texto: "Fez agachamento." } } },
    { ordem: 1, tipo: "audio", arquivoAudio: { transcricao: { texto: "Dificuldade na última série." } } }
  ];
  const contexto = montarContextoConsolidado(entradas);
  const linhas = contexto.split("\n");
  assert.match(linhas[0], /Fez agachamento/);
  assert.match(linhas[1], /Dificuldade na última série/);
  assert.match(linhas[2], /Aumentar carga/);
});

// ---- fork por tipo (docs/adr/0018) - integração ----

let usuario;
let equipe;
let aluno;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipe = await Equipe.create({ nome: `Equipe de Teste ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno de Teste" });
});

after(async () => {
  await Aluno.destroy({ where: { id: aluno.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
  await Equipe.destroy({ where: { id: equipe.id } });
});

async function criarRegistroTexto(tipo, texto) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status: Registro.STATUS.RECEBIDO,
    tipo
  });
  await RegistroEntrada.create({ registro_id: registro.id, ordem: 0, tipo: "texto", conteudo_texto: texto });
  return registro;
}

test("processarRegistro: tipo avaliacao_fisica grava proposta_avaliacao_fisica e nunca toca resultado_ia", async (t) => {
  t.mock.method(geminiService, "interpretarAvaliacaoFisica", async () => ({
    dataOuvida: "2026-08-28",
    medidas: [{ metrica_codigo: "peso", metodo: "direto", valor: 78.4, principal: true, confianca: "alta", trecho_origem: "peso setenta e oito e quatro" }],
    observacoes: "",
    naoMapeado: [{ trecho: "barriga mais dura", motivo: "sem métrica no catálogo" }]
  }));

  const registro = await criarRegistroTexto(Registro.TIPOS.AVALIACAO_FISICA, "peso setenta e oito e quatro, a barriga tá mais dura");
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await processarRegistro(registro.id);

  const proposta = await PropostaAvaliacaoFisica.findOne({ where: { registro_id: registro.id } });
  assert.ok(proposta, "deveria existir uma proposta_avaliacao_fisica");
  assert.equal(proposta.status, "concluido");
  assert.equal(proposta.payload_json.medidas[0].metrica_codigo, "peso");
  assert.equal(proposta.payload_json.data_ouvida, "2026-08-28");
  assert.deepEqual(proposta.avisos_json, [{ trecho: "barriga mais dura", motivo: "sem métrica no catálogo" }]);

  const atualizado = await Registro.findByPk(registro.id);
  assert.equal(atualizado.status, Registro.STATUS.AGUARDANDO_REVISAO);

  assert.equal(await ResultadoIa.count({ where: { registro_id: registro.id } }), 0, "avaliação física nunca cria resultado_ia");
});

test("processarRegistro: falha do interpretador de avaliação física -> erro_interpretacao + proposta 'falha'", async (t) => {
  t.mock.method(geminiService, "interpretarAvaliacaoFisica", async () => {
    throw new Error("responseSchema inválido");
  });

  const registro = await criarRegistroTexto(Registro.TIPOS.AVALIACAO_FISICA, "cintura oitenta e quatro");
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await assert.rejects(() => processarRegistro(registro.id), /responseSchema inválido/);

  const proposta = await PropostaAvaliacaoFisica.findOne({ where: { registro_id: registro.id } });
  assert.equal(proposta.status, "falha");
  assert.match(proposta.erro, /responseSchema inválido/);

  const atualizado = await Registro.findByPk(registro.id);
  assert.equal(atualizado.status, Registro.STATUS.ERRO_INTERPRETACAO);
});

test("processarRegistro: tipo atendimento continua indo para resultado_ia (fluxo inalterado)", async (t) => {
  t.mock.method(geminiService, "interpretarRegistro", async () => ({
    itens: [{ label: "Agachamento", valor: "4x10" }],
    notaGeral: ""
  }));

  const registro = await criarRegistroTexto(Registro.TIPOS.ATENDIMENTO, "fez agachamento quatro por dez");
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await processarRegistro(registro.id);

  assert.equal(await ResultadoIa.count({ where: { registro_id: registro.id } }), 1);
  assert.equal(await PropostaAvaliacaoFisica.count({ where: { registro_id: registro.id } }), 0);

  const atualizado = await Registro.findByPk(registro.id);
  assert.equal(atualizado.status, Registro.STATUS.AGUARDANDO_REVISAO);
});
