"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md
//
// O Radar - "fofoqueira científica". A IA vigia as fontes da allowlist
// (config/radar.js) e, quando acha algo que pode interessar a um personal,
// publica um PONTEIRO para a fonte. Nunca conhecimento oficial: é uma ilha,
// não toca `resultado_ia`/`validacao`/`avaliacao_fisica*` nem os prompts do
// acompanhamento. Sem revisão humana por item - as proteções são: verificação
// de link, dedup, teto de volume, enquadramento na UI, feedback e o log de
// cada execução.
const crypto = require("node:crypto");
const RADAR = require("../config/radar");
const env = require("../config/env");
const geminiService = require("./ia/gemini.service");
const verificarLinkUtil = require("../shared/utils/verificar-link");
const radarRepository = require("../repositories/radar.repository");
const logger = require("../shared/logger");
const { validarDataIso } = require("../shared/utils/periodo");

const TIPOS_VALIDOS = new Set([
  "diretriz",
  "position_stand",
  "revisao_sistematica",
  "meta_analise",
  "estudo_primario",
  "consenso",
  "outro"
]);
// A tela do Radar não pagina (feed curado, semanal, com busca textual
// client-side - docs/adr/0022 §9); ela pede uma página grande e filtra em
// memória. Se "Tudo" passar disso um dia, aí entra "carregar mais".
const PADRAO_POR_PAGINA = 300;
const MAX_POR_PAGINA = 300;
const MS_DIA = 24 * 60 * 60 * 1000;

function texto(valor, max) {
  if (typeof valor !== "string") return "";
  return valor.trim().slice(0, max);
}

// Deduplicação (docs/adr/0022, adendo). A IA re-acha o mesmo paper a cada
// busca, mas reformula o título traduzido e varia o formato da URL (doi.org
// numa rodada, pubmed.../ID na outra) - então nem título nem domínio são
// estáveis. Três camadas:
//   1. DOI extraído da URL, quando houver - o identificador mais confiável.
//   2. assinatura do título (tokens sem acento/pontuação/stopwords, ordenados)
//      - pega reformulações que só trocam palavra de ligação.
//   3. similaridade de Jaccard entre conjuntos de tokens do título >= LIMIAR
//      - rede de segurança para quando muda 1 palavra de conteúdo.
// (4ª camada, no prompt: a lista "já no Radar" mandada ao Gemini.)
const STOPWORDS = new Set([
  "a", "o", "os", "as", "um", "uma", "de", "da", "do", "das", "dos", "e", "em",
  "no", "na", "nos", "nas", "ao", "aos", "com", "sem", "para", "por", "que",
  "the", "of", "and", "in", "on", "for", "to", "with", "an", "at", "vs", "versus"
]);

const RE_DOI = /\b(10\.\d{4,9}\/[^\s"'<>()\]]+)/i;
// Alto de propósito: a assinatura exata do título e o DOI pegam a maior parte;
// o Jaccard só cobre "mesma publicação com 1 palavra trocada no título". Baixo
// demais transformaria dois estudos parecidos ("...em idosos" x "...em jovens")
// num falso positivo.
const LIMIAR_SIMILARIDADE = 0.9;

function extrairDoi(url) {
  const m = String(url || "").match(RE_DOI);
  if (!m) return null;
  return m[1].toLowerCase().replace(/[.,;)\]}]+$/, "");
}

function tokensTitulo(titulo) {
  return String(titulo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function assinaturaTitulo(titulo) {
  return [...new Set(tokensTitulo(titulo))].sort().join(" ");
}

// Chave estável de um item: DOI se a URL trouxer um, senão o hash da
// assinatura do título. Gravada em radar_item.chave_dedup (UNIQUE).
function chaveDedup(titulo, url) {
  const doi = extrairDoi(url);
  if (doi) return `doi:${doi}`;
  return `sig:${crypto.createHash("sha1").update(assinaturaTitulo(titulo)).digest("hex")}`;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// Vocabulário fixo de assuntos = todos os assuntos dos grupos (config/radar.js).
// A IA é instruída a escolher da lista; `snapAssunto` encaixa cada valor que ela
// devolve no termo canônico (tolera acento/caixa/reformulação leve) e descarta
// o que não reconhecer - assim o filtro por grupo da tela nunca quebra.
const VOCAB_ASSUNTOS = RADAR.gruposAssunto.flatMap((g) => g.assuntos);
const VOCAB_TOKENS = VOCAB_ASSUNTOS.map((v) => ({ canonico: v, tokens: new Set(tokensTitulo(v)) }));

function snapAssunto(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const tk = new Set(tokensTitulo(raw));
  let melhor = null;
  let melhorSim = 0;
  for (const v of VOCAB_TOKENS) {
    const sim = jaccard(tk, v.tokens);
    if (sim > melhorSim) {
      melhorSim = sim;
      melhor = v.canonico;
    }
  }
  return melhorSim >= 0.5 ? melhor : null;
}

// Assuntos (chaves de grupo, ex.: "forca,populacoes") -> lista de assuntos
// canônicos a filtrar. Ignora chave desconhecida.
function assuntosDosGrupos(chaves) {
  const set = new Set(chaves);
  return RADAR.gruposAssunto.filter((g) => set.has(g.chave)).flatMap((g) => g.assuntos);
}

// Item bruto da IA -> item pronto para inserir, ou null se malformado
// (faltando campo obrigatório, URL inválida). O service descarta o null.
function normalizarItem(bruto) {
  if (!bruto || typeof bruto !== "object") return null;

  const titulo = texto(bruto.titulo, 300);
  const url = texto(bruto.url, 2000);
  const fonte = texto(bruto.fonte, 200);
  const resumo = texto(bruto.resumo, 2000);
  const motivo = texto(bruto.motivo_relevancia, 1000);
  if (!titulo || !url || !fonte || !resumo || !motivo) return null;

  let urlValida;
  try {
    urlValida = new URL(url);
  } catch (_err) {
    return null;
  }
  if (urlValida.protocol !== "http:" && urlValida.protocol !== "https:") return null;

  const assuntos = Array.isArray(bruto.assuntos)
    ? [...new Set(bruto.assuntos.map(snapAssunto).filter(Boolean))].slice(0, 3)
    : [];

  return {
    titulo,
    url,
    fonte,
    resumo,
    motivo_relevancia: motivo,
    tipo: TIPOS_VALIDOS.has(bruto.tipo) ? bruto.tipo : "outro",
    data_informada: texto(bruto.data_informada, 40) || null,
    assuntos
  };
}

function janelaBusca(dias) {
  const ate = new Date();
  const de = new Date(ate.getTime() - dias * MS_DIA);
  return { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) };
}

// coleta (uma busca por grupo de assunto) -> triagem -> dedup -> verificação
// de link -> publicação. Falha de um grupo não derruba os outros; só se
// TODOS os grupos falharem a execução vira `falha`. Nunca relança (o job
// precisa continuar; o disparo manual devolve o resumo).
async function rodarCiclo({ maxItensPorCiclo = RADAR.maxItensPorCiclo } = {}) {
  const janela = janelaBusca(RADAR.janelaDias);
  const modelo = env.radar.model || env.gemini.model;
  const execucao = await radarRepository.criarExecucao({
    janelaDe: janela.de,
    janelaAte: janela.ate,
    modelo
  });

  try {
    const jaPublicados = await radarRepository.itensRecentes(30);
    const existentes = await radarRepository.listarParaDedup();
    const chavesConhecidas = new Set(existentes.map((e) => e.chave_dedup));
    const tokensConhecidos = existentes.map((e) => new Set(tokensTitulo(e.titulo)));

    const descartes = [];
    const aInserir = [];
    const promptDebug = [];
    const respostaDebug = [];
    const gruposComErro = [];
    let recebidos = 0;

    for (const grupo of RADAR.gruposAssunto) {
      let resultado;
      try {
        // eslint-disable-next-line no-await-in-loop
        resultado = await geminiService.buscarRadar({
          assuntos: grupo.assuntos,
          fontes: RADAR.fontes,
          janela,
          criterios: RADAR.criteriosRelevancia,
          maxItens: RADAR.maxItensPorGrupo,
          jaPublicados,
          foco: grupo.nome
        });
      } catch (err) {
        gruposComErro.push({ nome: grupo.nome, erro: err.message });
        descartes.push({ titulo: `[grupo: ${grupo.nome}]`, motivo: `erro_busca: ${err.message}` });
        continue;
      }

      promptDebug.push(`### ${grupo.nome}\n${resultado.promptUsado}`);
      respostaDebug.push(`### ${grupo.nome}\n${resultado.respostaCrua}`);
      recebidos += (resultado.itens || []).length;

      for (const bruto of (resultado.itens || []).slice(0, RADAR.maxItensPorGrupo)) {
        if (aInserir.length >= maxItensPorCiclo) break;

        const item = normalizarItem(bruto);
        if (!item) {
          descartes.push({ titulo: texto(bruto && bruto.titulo, 300) || "(sem título)", motivo: "malformado" });
          continue;
        }

        const chave = chaveDedup(item.titulo, item.url);
        const tokens = new Set(tokensTitulo(item.titulo));
        const duplicado =
          chavesConhecidas.has(chave) ||
          tokensConhecidos.some((prev) => jaccard(tokens, prev) >= LIMIAR_SIMILARIDADE);
        if (duplicado) {
          descartes.push({ titulo: item.titulo, motivo: "duplicado" });
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const urlStatus = await verificarLinkUtil.verificarLink(item.url);
        if (urlStatus === "quebrado") {
          descartes.push({ titulo: item.titulo, motivo: "link_quebrado" });
          continue;
        }

        chavesConhecidas.add(chave);
        tokensConhecidos.push(tokens);
        aInserir.push({
          ...item,
          chave_dedup: chave,
          url_status: urlStatus,
          url_verificada_em: new Date(),
          execucao_id: execucao.id
        });
      }
    }

    const todosFalharam = gruposComErro.length === RADAR.gruposAssunto.length;
    const status = todosFalharam ? "falha" : "concluida";
    const erro = todosFalharam ? gruposComErro[0].erro : null;

    await radarRepository.inserirItens(aInserir);
    await radarRepository.finalizarExecucao(execucao.id, {
      status,
      prompt: promptDebug.join("\n\n"),
      resposta_crua: respostaDebug.join("\n\n"),
      itens_recebidos: recebidos,
      itens_publicados: aInserir.length,
      descartes_json: descartes,
      erro
    });

    logger.info(
      { execucaoId: execucao.id, status, recebidos, publicados: aInserir.length, descartes: descartes.length, gruposComErro: gruposComErro.length },
      "[radar] ciclo concluído"
    );
    return {
      execucao_id: execucao.id,
      status,
      itens_recebidos: recebidos,
      itens_publicados: aInserir.length,
      descartes,
      erro
    };
  } catch (err) {
    logger.error({ err, execucaoId: execucao.id }, "[radar] falha no ciclo");
    await radarRepository.finalizarExecucao(execucao.id, {
      status: "falha",
      erro: err.message,
      itens_recebidos: 0,
      itens_publicados: 0
    });
    return {
      execucao_id: execucao.id,
      status: "falha",
      erro: err.message,
      itens_recebidos: 0,
      itens_publicados: 0,
      descartes: []
    };
  }
}

function serializarItem(item) {
  return {
    id: item.id,
    titulo: item.titulo,
    fonte: item.fonte,
    url: item.url,
    url_status: item.url_status,
    tipo: item.tipo,
    data_informada: item.data_informada,
    resumo: item.resumo,
    motivo_relevancia: item.motivo_relevancia,
    assuntos: item.assuntos || [],
    created_at: item.created_at
  };
}

function normalizarGrupos(valor) {
  if (!valor) return [];
  const bruto = Array.isArray(valor) ? valor : String(valor).split(",");
  const validas = new Set(RADAR.gruposAssunto.map((g) => g.chave));
  return bruto.map((c) => c.trim()).filter((c) => validas.has(c));
}

// Filtros opcionais: janela por `created_at` (de/ate - mesma validação de
// Atendimentos/Histórico) e grupos de assunto (chaves de config/radar.js).
// A resposta traz `grupos` (chave + nome + assuntos - a tela usa nome/chave
// nos chips e nome/assuntos no painel "Fontes e assuntos priorizados"),
// `fontes` (nome curto + domínio) e `janela_dias` (a mesma janela que a busca
// semanal aplica - ajuda a explicar por que algo entrou ou não no Radar).
async function listar({ pagina, porPagina, de, ate, grupos } = {}) {
  const p = Math.max(1, Number.parseInt(pagina, 10) || 1);
  const pp = Math.min(MAX_POR_PAGINA, Math.max(1, Number.parseInt(porPagina, 10) || PADRAO_POR_PAGINA));

  const deIso = de ? validarDataIso(String(de), "de") : null;
  const ateIso = ate ? validarDataIso(String(ate), "ate") : null;

  const chavesGrupo = normalizarGrupos(grupos);
  const assuntos = chavesGrupo.length ? assuntosDosGrupos(chavesGrupo) : null;

  const { rows, count } = await radarRepository.listarItensVisiveis({
    limite: pp,
    offset: (p - 1) * pp,
    de: deIso,
    ate: ateIso,
    assuntos
  });

  return {
    itens: rows.map(serializarItem),
    total: count,
    pagina: p,
    por_pagina: pp,
    grupos: RADAR.gruposAssunto.map((g) => ({ chave: g.chave, nome: g.nome, assuntos: g.assuntos })),
    fontes: RADAR.fontes.map((f) => ({ nome: f.curto || f.nome, dominio: f.dominio })),
    janela_dias: RADAR.janelaDias
  };
}

async function listarExecucoes() {
  const execucoes = await radarRepository.listarExecucoes({ limite: 20 });
  return execucoes.map((e) => ({
    id: e.id,
    status: e.status,
    iniciada_em: e.iniciada_em,
    concluida_em: e.concluida_em,
    janela_de: e.janela_de,
    janela_ate: e.janela_ate,
    modelo: e.modelo,
    itens_recebidos: e.itens_recebidos,
    itens_publicados: e.itens_publicados,
    descartes: e.descartes_json || [],
    erro: e.erro,
    prompt: e.prompt,
    resposta_crua: e.resposta_crua
  }));
}

module.exports = {
  rodarCiclo,
  listar,
  listarExecucoes,
  // exportados para teste
  chaveDedup,
  extrairDoi,
  normalizarItem,
  snapAssunto,
  janelaBusca
};
