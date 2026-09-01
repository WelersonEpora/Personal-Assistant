"use strict";

// docs/adr/0020-tela-de-atendimentos.md
//
// Monta o relatório de atividade por período (tela Atendimentos do /admin).
// Somente leitura, sobre `registro`, escopo por equipe. Eixo temporal sempre
// `data_atendimento` (docs/adr/0019). NÃO altera a ADR-0015 (bucketing do
// ciclo mensal segue por `confirmado_em`) nem a ADR-0017 (feed por `created_at`).
const atividadesRepository = require("../repositories/atividades.repository");
const membroRepository = require("../repositories/membro.repository");
const { ValidationError } = require("../shared/errors");
const { validarDataIso } = require("../shared/utils/periodo");

const MS_DIA = 24 * 60 * 60 * 1000;
// Guarda-corpo de custo - a UI só oferece presets até "Este ano".
const JANELA_MAX_DIAS = 366;
const TIPOS_VALIDOS = ["atendimento", "avaliacao_fisica"];

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}
function primeiroDiaDoMesIso() {
  return `${hojeIso().slice(0, 8)}01`;
}

function diasEntre(de, ate) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / MS_DIA);
}

// docs/adr/0020: dia p/ períodos curtos, semana até ~1 trimestre, mês além.
function escolherGranularidade(amplitudeDias) {
  if (amplitudeDias <= 31) return "dia";
  if (amplitudeDias <= 92) return "semana";
  return "mes";
}

async function normalizarFiltros(equipeId, query = {}) {
  const de = query.de ? validarDataIso(String(query.de), "de") : primeiroDiaDoMesIso();
  const ate = query.ate ? validarDataIso(String(query.ate), "ate") : hojeIso();
  if (de > ate) {
    throw new ValidationError('"de" não pode ser depois de "ate".');
  }
  const amplitude = diasEntre(de, ate);
  if (amplitude > JANELA_MAX_DIAS) {
    throw new ValidationError("O período não pode passar de 1 ano.");
  }

  const tipo = query.tipo ? String(query.tipo) : null;
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    throw new ValidationError('"tipo" deve ser "atendimento" ou "avaliacao_fisica".');
  }

  const alunoId = query.aluno_id ? String(query.aluno_id) : null;
  const somenteConfirmados = query.somente_confirmados === "true" || query.somente_confirmados === true;

  // docs/adr/0020 (adendo): filtro opcional por personal. O cliente manda o
  // `membro.id` (conceito de equipe); o Registro guarda `usuario_id`. Resolve
  // aqui e valida que o membro é da equipe do token (isolamento).
  const membroId = query.membro_id ? String(query.membro_id) : null;
  let usuarioId = null;
  if (membroId) {
    const membro = await membroRepository.findByIdAndEquipe(membroId, equipeId);
    if (!membro) {
      throw new ValidationError('"membro_id" não pertence a esta equipe.');
    }
    usuarioId = membro.usuario_id;
  }

  return { equipeId, de, ate, alunoId, membroId, usuarioId, tipo, somenteConfirmados, amplitude };
}

function isoDia(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// Todos os buckets do intervalo, inclusive os vazios (o gráfico não pode
// "pular" períodos sem atividade). Semana ancorada na segunda-feira, igual ao
// `date_trunc('week', ...)` do Postgres.
function gerarBuckets(de, ate, granularidade) {
  const buckets = [];

  if (granularidade === "mes") {
    let [ano, mes] = de.split("-").map(Number);
    const [anoFim, mesFim] = ate.split("-").map(Number);
    while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
      buckets.push(`${ano}-${String(mes).padStart(2, "0")}`);
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    return buckets;
  }

  const fim = Date.parse(`${ate}T00:00:00Z`);
  let cursor = Date.parse(`${de}T00:00:00Z`);
  if (granularidade === "semana") {
    const dow = new Date(cursor).getUTCDay(); // 0 = domingo
    cursor += (dow === 0 ? -6 : 1 - dow) * MS_DIA;
  }
  const passo = (granularidade === "semana" ? 7 : 1) * MS_DIA;
  while (cursor <= fim) {
    buckets.push(isoDia(cursor));
    cursor += passo;
  }
  return buckets;
}

function montarSerieTemporal(linhas, de, ate, granularidade) {
  const porBucket = new Map(linhas.map((linha) => [linha.bucket, linha]));
  return gerarBuckets(de, ate, granularidade).map((bucket) => {
    const linha = porBucket.get(bucket);
    return {
      bucket,
      atendimento: linha ? Number(linha.atendimento) : 0,
      avaliacao_fisica: linha ? Number(linha.avaliacao_fisica) : 0
    };
  });
}

function montarDiaSemana(linhas) {
  const porDow = new Map(linhas.map((linha) => [Number(linha.dow), Number(linha.atendimentos)]));
  return Array.from({ length: 7 }, (_, dow) => ({ dow, atendimentos: porDow.get(dow) || 0 }));
}

function montarPorAluno(linhas, alunos) {
  const alunoPorId = new Map(alunos.map((aluno) => [aluno.id, aluno]));
  return linhas
    .map((linha) => {
      const aluno = alunoPorId.get(linha.aluno_id);
      return {
        aluno_id: linha.aluno_id,
        nome: aluno?.nome || "Aluno removido",
        aluno_removido: Boolean(aluno?.deletado_em) || !aluno,
        atendimentos: Number(linha.atendimentos),
        avaliacoes_fisicas: Number(linha.avaliacoes_fisicas),
        dias_distintos: Number(linha.dias_distintos),
        primeiro: linha.primeiro || null,
        ultimo: linha.ultimo || null
      };
    })
    .sort((a, b) => b.atendimentos - a.atendimentos || a.nome.localeCompare(b.nome, "pt-BR"));
}

// docs/adr/0020 (adendo) - ranking/tabela por personal. `nome` vem de
// `nomesMembros`; `personal_na_equipe = false` marca quem já saiu (o Registro
// e o trabalho feito continuam contando).
function montarPorMembro(linhas, membros) {
  const membroPorId = new Map(membros.map((m) => [m.id, m]));
  return linhas
    .map((linha) => {
      const membro = membroPorId.get(linha.usuario_id);
      return {
        usuario_id: linha.usuario_id,
        nome: membro?.nome || "Personal removido",
        personal_na_equipe: Boolean(membro?.na_equipe),
        atendimentos: Number(linha.atendimentos),
        avaliacoes_fisicas: Number(linha.avaliacoes_fisicas),
        dias_distintos: Number(linha.dias_distintos),
        alunos_distintos: Number(linha.alunos_distintos),
        primeiro: linha.primeiro || null,
        ultimo: linha.ultimo || null
      };
    })
    .sort((a, b) => b.atendimentos - a.atendimentos || a.nome.localeCompare(b.nome, "pt-BR"));
}

function montarPorMes(linhas) {
  return linhas.map((linha) => ({
    mes: linha.mes,
    atendimentos: Number(linha.atendimentos),
    avaliacoes_fisicas: Number(linha.avaliacoes_fisicas),
    alunos_distintos: Number(linha.alunos_distintos)
  }));
}

async function obterAtividades(equipeId, query) {
  const filtros = await normalizarFiltros(equipeId, query);
  const granularidade = escolherGranularidade(filtros.amplitude);

  const [resumoRaw, serieRaw, alunoRaw, membroRaw, diaSemanaRaw, mesRaw, personais] = await Promise.all([
    atividadesRepository.resumo(filtros),
    atividadesRepository.porBucket(filtros, granularidade),
    atividadesRepository.porAluno(filtros),
    atividadesRepository.porMembro(filtros),
    atividadesRepository.porDiaSemana(filtros),
    atividadesRepository.porMes(filtros),
    atividadesRepository.membrosDaEquipe(equipeId)
  ]);

  const ids = alunoRaw.map((linha) => linha.aluno_id);
  const alunos = ids.length ? await atividadesRepository.nomesAlunos(ids) : [];

  const membroIds = membroRaw.map((linha) => linha.usuario_id);
  const membros = membroIds.length ? await atividadesRepository.nomesMembros(membroIds, equipeId) : [];

  const mediaPorAluno = resumoRaw.alunos_atendidos
    ? Math.round((resumoRaw.atendimentos / resumoRaw.alunos_atendidos) * 10) / 10
    : 0;

  return {
    periodo: { de: filtros.de, ate: filtros.ate, granularidade },
    filtros: {
      aluno_id: filtros.alunoId,
      membro_id: filtros.membroId,
      tipo: filtros.tipo,
      somente_confirmados: filtros.somenteConfirmados
    },
    personais,
    resumo: { ...resumoRaw, media_por_aluno: mediaPorAluno },
    serie_temporal: montarSerieTemporal(serieRaw, filtros.de, filtros.ate, granularidade),
    por_aluno: montarPorAluno(alunoRaw, alunos),
    por_membro: montarPorMembro(membroRaw, membros),
    por_dia_semana: montarDiaSemana(diaSemanaRaw),
    por_mes: montarPorMes(mesRaw)
  };
}

module.exports = { obterAtividades, escolherGranularidade, gerarBuckets };
