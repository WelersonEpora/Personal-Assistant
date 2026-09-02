"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md: o Radar. Integração - toca o
// banco de teste (NODE_ENV=test). Mocka o Gemini (`buscarRadar`) e a
// verificação de link; o resto (dedup, teto, descartes, feed, filtro de
// período) roda de verdade contra as tabelas radar_*.
//
// `rodarCiclo` chama `buscarRadar` uma vez POR GRUPO de assunto (config/radar.js).
// `mockBuscar` devolve os itens só na 1ª chamada (como se um grupo tivesse
// achados e os outros não) - assim `itens_recebidos` = itens.length.

const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { RadarItem, RadarExecucao } = require("../models");
const geminiService = require("./ia/gemini.service");
const verificarLinkUtil = require("../shared/utils/verificar-link");
const radarService = require("./radar.service");

function itemBruto(over = {}) {
  return {
    titulo: `Revisão sobre frequência de treino ${randomUUID().slice(0, 8)}`,
    fonte: "British Journal of Sports Medicine",
    url: `https://bjsm.bmj.com/content/${randomUUID().slice(0, 8)}`,
    tipo: "revisao_sistematica",
    data_informada: "2026-08",
    resumo: "Revisão de estudos sobre distribuição semanal de volume.",
    motivo_relevancia: "É uma revisão sistemática sobre frequência de treino.",
    assuntos: ["treinamento de força e hipertrofia"],
    ...over
  };
}

function mockBuscar(t, itens) {
  let chamada = 0;
  t.mock.method(geminiService, "buscarRadar", async () => {
    chamada += 1;
    return {
      itens: chamada === 1 ? itens : [],
      promptUsado: "PROMPT",
      respostaCrua: "RAW",
      modelo: "mock-model"
    };
  });
}

function mockLinks(t, fn = () => "ok") {
  t.mock.method(verificarLinkUtil, "verificarLink", async (url) => fn(url));
}

afterEach(async () => {
  await RadarItem.destroy({ where: {} });
  await RadarExecucao.destroy({ where: {} });
});

test("rodarCiclo: publica itens válidos e fecha a execução como concluida", async (t) => {
  mockBuscar(t, [itemBruto(), itemBruto()]);
  mockLinks(t);

  const r = await radarService.rodarCiclo();

  assert.equal(r.status, "concluida");
  assert.equal(r.itens_recebidos, 2);
  assert.equal(r.itens_publicados, 2);

  const itens = await RadarItem.findAll();
  assert.equal(itens.length, 2);
  assert.equal(itens[0].url_status, "ok");
  assert.ok(itens[0].chave_dedup);

  const execucao = await RadarExecucao.findByPk(r.execucao_id);
  assert.equal(execucao.status, "concluida");
  assert.match(execucao.prompt, /PROMPT/); // um bloco "### <grupo>\nPROMPT" por grupo
  assert.equal(execucao.itens_publicados, 2);
});

test("rodarCiclo: item já publicado antes é descartado como duplicado", async (t) => {
  const bruto = itemBruto();
  mockBuscar(t, [bruto]);
  mockLinks(t);
  await radarService.rodarCiclo();

  // segunda rodada devolve o MESMO item (mesmo título + domínio)
  mockBuscar(t, [bruto]);
  mockLinks(t);
  const r2 = await radarService.rodarCiclo();

  assert.equal(r2.itens_publicados, 0);
  assert.deepEqual(r2.descartes, [{ titulo: bruto.titulo, motivo: "duplicado" }]);
  assert.equal(await RadarItem.count(), 1);
});

test("rodarCiclo: link quebrado é descartado e não entra no feed", async (t) => {
  const ok = itemBruto();
  const quebrado = itemBruto({ url: "https://bjsm.bmj.com/quebrado" });
  mockBuscar(t, [ok, quebrado]);
  mockLinks(t, (url) => (url.includes("quebrado") ? "quebrado" : "ok"));

  const r = await radarService.rodarCiclo();

  assert.equal(r.itens_publicados, 1);
  assert.equal(r.descartes.length, 1);
  assert.equal(r.descartes[0].motivo, "link_quebrado");
  assert.equal(await RadarItem.count(), 1);
});

test("rodarCiclo: link 'nao_verificado' (403 etc.) entra no feed com o selo", async (t) => {
  mockBuscar(t, [itemBruto()]);
  mockLinks(t, () => "nao_verificado");

  const r = await radarService.rodarCiclo();
  assert.equal(r.itens_publicados, 1);
  const item = await RadarItem.findOne();
  assert.equal(item.url_status, "nao_verificado");
});

test("rodarCiclo: respeita o teto total do ciclo (maxItensPorCiclo)", async (t) => {
  mockBuscar(t, [itemBruto(), itemBruto(), itemBruto(), itemBruto()]);
  mockLinks(t);

  const r = await radarService.rodarCiclo({ maxItensPorCiclo: 2 });
  assert.equal(r.itens_publicados, 2);
  assert.equal(await RadarItem.count(), 2);
});

test("rodarCiclo: item malformado (sem url) é descartado", async (t) => {
  mockBuscar(t, [itemBruto(), itemBruto({ url: "" })]);
  mockLinks(t);

  const r = await radarService.rodarCiclo();
  assert.equal(r.itens_publicados, 1);
  assert.equal(r.descartes[0].motivo, "malformado");
});

test("rodarCiclo: falha do Gemini -> execução 'falha', sem throw, feed inalterado", async (t) => {
  t.mock.method(geminiService, "buscarRadar", async () => {
    throw new Error("GEMINI_API_KEY não configurada");
  });

  const r = await radarService.rodarCiclo();
  assert.equal(r.status, "falha");
  assert.match(r.erro, /GEMINI_API_KEY/);
  assert.equal(await RadarItem.count(), 0);

  const execucao = await RadarExecucao.findByPk(r.execucao_id);
  assert.equal(execucao.status, "falha");
});

test("rodarCiclo: resposta vazia [] -> execução concluida com 0 itens", async (t) => {
  mockBuscar(t, []);
  mockLinks(t);

  const r = await radarService.rodarCiclo();
  assert.equal(r.status, "concluida");
  assert.equal(r.itens_recebidos, 0);
  assert.equal(r.itens_publicados, 0);
});

test("listar: só itens visíveis, sem link quebrado, mais recente primeiro", async (t) => {
  mockBuscar(t, [itemBruto({ titulo: "Primeiro" }), itemBruto({ titulo: "Segundo" })]);
  mockLinks(t);
  await radarService.rodarCiclo();

  const todos = await RadarItem.findAll({ order: [["created_at", "ASC"]] });
  await todos[0].update({ visivel: false });

  const r = await radarService.listar();
  assert.equal(r.total, 1);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].id, todos[1].id);
  assert.equal(r.itens[0].meu_feedback, undefined); // feedback foi removido
});

test("listar: filtra por janela de created_at (de/ate)", async (t) => {
  mockBuscar(t, [itemBruto({ titulo: "Antigo" }), itemBruto({ titulo: "Recente" })]);
  mockLinks(t);
  await radarService.rodarCiclo();

  const [antigo, recente] = await RadarItem.findAll({ order: [["titulo", "ASC"]] });
  const setCriadoEm = (id, ts) =>
    RadarItem.sequelize.query("UPDATE radar_item SET created_at = :ts WHERE id = :id", {
      replacements: { ts, id }
    });
  await setCriadoEm(antigo.id, "2026-06-10T12:00:00Z");
  await setCriadoEm(recente.id, "2026-09-10T12:00:00Z");

  const soRecente = await radarService.listar({ de: "2026-09-01", ate: "2026-09-30" });
  assert.equal(soRecente.total, 1);
  assert.equal(soRecente.itens[0].id, recente.id);

  const tudo = await radarService.listar({ de: "2026-01-01", ate: "2026-12-31" });
  assert.equal(tudo.total, 2);
});

test("listar: data inválida ou fora de formato -> ValidationError", async () => {
  await assert.rejects(() => radarService.listar({ de: "2026-13-01" }), /formato|válida/);
  await assert.rejects(() => radarService.listar({ ate: "ontem" }), /formato|válida/);
});

test("listar: filtra por grupo de assunto; chave inválida é ignorada; resposta traz os grupos", async (t) => {
  mockBuscar(t, [
    itemBruto({ titulo: "Item de força", assuntos: ["treinamento de força e hipertrofia"] }),
    itemBruto({ titulo: "Item de recuperação", assuntos: ["recuperação, sono e dor muscular tardia"] })
  ]);
  mockLinks(t);
  await radarService.rodarCiclo();

  const soForca = await radarService.listar({ grupos: "forca" });
  assert.equal(soForca.total, 1);
  assert.equal(soForca.itens[0].titulo, "Item de força");

  const soRecup = await radarService.listar({ grupos: ["avaliacao_recuperacao"] });
  assert.equal(soRecup.total, 1);
  assert.equal(soRecup.itens[0].titulo, "Item de recuperação");

  const todos = await radarService.listar({ grupos: "xpto" }); // chave inexistente -> ignorada
  assert.equal(todos.total, 2);
  assert.ok(todos.grupos.some((g) => g.chave === "forca" && g.nome));
  // a resposta também traz a allowlist de fontes (linha informativa da tela)
  assert.ok(todos.fontes.some((f) => f.nome === "PubMed" && f.dominio));
  assert.ok(todos.fontes.some((f) => f.nome === "SciELO Brasil"));
});

test("snapAssunto: encaixa no vocabulário (exato, reformulado) e descarta o desconhecido", () => {
  assert.equal(radarService.snapAssunto("Treinamento de Força e Hipertrofia"), "treinamento de força e hipertrofia");
  assert.equal(radarService.snapAssunto("recuperação, sono e dor muscular"), "recuperação, sono e dor muscular tardia");
  assert.equal(radarService.snapAssunto("culinária vegana"), null);
  assert.equal(radarService.snapAssunto(""), null);
});

test("normalizarItem: assuntos fora do vocabulário são descartados", () => {
  const item = radarService.normalizarItem({
    titulo: "T", url: "https://x.org/a", fonte: "F", resumo: "R", motivo_relevancia: "M",
    assuntos: ["treinamento de força e hipertrofia", "receitas de bolo", "periodização, volume e frequência de treino"]
  });
  assert.deepEqual(item.assuntos, ["treinamento de força e hipertrofia", "periodização, volume e frequência de treino"]);
});

test("extrairDoi: pega 10.xxxx/... da URL e normaliza; null quando não há", () => {
  assert.equal(radarService.extrairDoi("https://doi.org/10.1016/j.exger.2026.113305"), "10.1016/j.exger.2026.113305");
  assert.equal(radarService.extrairDoi("https://DOI.org/10.1113/EP094042."), "10.1113/ep094042");
  assert.equal(radarService.extrairDoi("https://pubmed.ncbi.nlm.nih.gov/42660338/"), null);
});

test("chaveDedup: DOI manda - mesmo paper, títulos e domínios diferentes = mesma chave", () => {
  const a = radarService.chaveDedup("Título de um jeito", "https://doi.org/10.1113/EP094042");
  const b = radarService.chaveDedup("Título totalmente reescrito", "https://x.org/artigo?doi=10.1113/ep094042");
  assert.equal(a, b);
  assert.equal(a, "doi:10.1113/ep094042");
});

test("chaveDedup: sem DOI, cai na assinatura do título (ignora acento, caixa, stopword, domínio)", () => {
  const a = radarService.chaveDedup("Diretriz de Atividade Física", "https://www.who.int/x");
  const b = radarService.chaveDedup("diretriz   de   atividade   fisica", "https://acsm.org/z");
  assert.equal(a, b);
  const c = radarService.chaveDedup("Position stand sobre volume de treino", "https://who.int/y");
  assert.notEqual(a, c);
});

test("rodarCiclo: quase-duplicata (título reformulado, 1 palavra a mais) é descartada por similaridade", async (t) => {
  mockBuscar(t, [
    itemBruto({
      titulo: "Efeitos do treino de sobrecarga excêntrica na força de membros inferiores, marcha e equilíbrio em idosos",
      url: "https://pubmed.ncbi.nlm.nih.gov/1/"
    })
  ]);
  mockLinks(t);
  await radarService.rodarCiclo();

  mockBuscar(t, [
    itemBruto({
      titulo: "Efeitos do treino de sobrecarga excêntrica na força de membros inferiores, no desempenho da marcha e no equilíbrio em idosos",
      url: "https://pubmed.ncbi.nlm.nih.gov/2/"
    })
  ]);
  mockLinks(t);
  const r2 = await radarService.rodarCiclo();

  assert.equal(r2.itens_publicados, 0);
  assert.equal(r2.descartes[0].motivo, "duplicado");
  assert.equal(await RadarItem.count(), 1);
});
