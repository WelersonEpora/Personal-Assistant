"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md: acesso a dados do Radar.
// Feed global (sem escopo de equipe). Três tabelas isoladas - nada aqui toca
// `resultado_ia`/`validacao`/`avaliacao_fisica*`.
const { Op } = require("sequelize");
const { RadarItem, RadarExecucao, sequelize } = require("../models");

function criarExecucao({ janelaDe, janelaAte, modelo }) {
  return RadarExecucao.create({
    status: RadarExecucao.STATUS.RODANDO,
    iniciada_em: new Date(),
    janela_de: janelaDe,
    janela_ate: janelaAte,
    modelo: modelo || null
  });
}

function finalizarExecucao(id, dados) {
  return RadarExecucao.update(
    { ...dados, concluida_em: new Date() },
    { where: { id } }
  );
}

async function ultimaExecucaoConcluida() {
  return RadarExecucao.findOne({
    where: { status: RadarExecucao.STATUS.CONCLUIDA },
    order: [["concluida_em", "DESC"]]
  });
}

function listarExecucoes({ limite = 20 } = {}) {
  return RadarExecucao.findAll({ order: [["iniciada_em", "DESC"]], limit: limite });
}

// chave_dedup + título de todos os itens - o service compara a chave estável
// E a similaridade de título de cada candidato contra esta lista.
function listarParaDedup() {
  return RadarItem.findAll({ attributes: ["chave_dedup", "titulo"], raw: true });
}

// Últimos N itens (título + URL) - vão no prompt como lista "já no Radar",
// para o Gemini não devolver de novo o que já foi publicado.
function itensRecentes(limite = 20) {
  return RadarItem.findAll({
    attributes: ["titulo", "url"],
    order: [["created_at", "DESC"]],
    limit: limite,
    raw: true
  });
}

// Curadoria do operador (via script radar:ocultar) - some com um item ruim
// sem apagar o histórico. Não há endpoint: o feed é global, curar é do operador.
function definirVisibilidade(id, visivel) {
  return RadarItem.update({ visivel }, { where: { id } });
}

function inserirItens(rows) {
  if (!rows.length) return Promise.resolve([]);
  return RadarItem.bulkCreate(rows);
}

// Feed: itens visíveis, sem link quebrado, mais recente primeiro. Filtros
// opcionais: janela por `created_at` (mesmo critério de Atendimentos /
// Histórico) e `assuntos` (item cujo array `assuntos` tem ao menos um dos
// valores - `jsonb_exists_any`, a forma-função de `?|`, sem o `?` que o
// Sequelize confunde com bind param).
function listarItensVisiveis({ limite, offset, de, ate, assuntos }) {
  const where = {
    visivel: true,
    url_status: { [Op.ne]: RadarItem.URL_STATUS.QUEBRADO }
  };
  if (de || ate) {
    where.created_at = {};
    if (de) where.created_at[Op.gte] = new Date(`${de}T00:00:00.000Z`);
    if (ate) where.created_at[Op.lte] = new Date(`${ate}T23:59:59.999Z`);
  }
  if (assuntos && assuntos.length) {
    const lista = assuntos.map((a) => sequelize.escape(a)).join(", ");
    where[Op.and] = [sequelize.literal(`jsonb_exists_any(assuntos, ARRAY[${lista}]::text[])`)];
  }
  return RadarItem.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit: limite,
    offset
  });
}

module.exports = {
  criarExecucao,
  finalizarExecucao,
  ultimaExecucaoConcluida,
  listarExecucoes,
  listarParaDedup,
  itensRecentes,
  definirVisibilidade,
  inserirItens,
  listarItensVisiveis
};
