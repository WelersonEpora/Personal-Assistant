"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md
//
// Gera a avaliação mensal de um aluno a partir de DOIS insumos apenas:
//   1. o contexto consolidado do mês anterior;
//   2. os relatos confirmados do mês atual.
// Relatos de meses anteriores nunca são reenviados (o contexto consolidado
// os resume). A avaliação é sempre proposta da IA - NUNCA dado oficial, e
// este service jamais escreve em `validacao` (docs/adr/0007). Para corrigir
// algo, o personal registra um novo relato, que entra no ciclo seguinte.
const avaliacaoMensalRepository = require("../repositories/avaliacaoMensal.repository");
const avaliacaoPersonalRepository = require("../repositories/avaliacaoPersonal.repository");
const alunoRepository = require("../repositories/aluno.repository");
const geminiService = require("./ia/gemini.service");
const env = require("../config/env");
const logger = require("../shared/logger");
const { NotFoundError, ValidationError } = require("../shared/errors");

// Mínimo de relatos confirmados no mês para acionar a IA. Abaixo disso o
// ciclo é registrado como "dados_insuficientes" e a IA não é chamada.
const MINIMO_RELATOS = 5;

const FORMATO_ANO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function validarAnoMes(anoMes) {
  if (!FORMATO_ANO_MES.test(anoMes || "")) {
    throw new ValidationError('Mês de referência inválido - use o formato "YYYY-MM".');
  }
  return anoMes;
}

// Limites do mês de referência. As Datas cobrem a janela [inicio, fim) usada
// na consulta de `confirmado_em`; as strings vão para periodo_inicio/fim
// (DATEONLY) e são derivadas do próprio "YYYY-MM" para não depender de fuso.
function limitesMes(anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    inicio: new Date(ano, mes - 1, 1),
    fim: new Date(ano, mes, 1),
    inicioData: `${anoMes}-01`,
    fimData: `${anoMes}-${String(ultimoDia).padStart(2, "0")}`
  };
}

// Mês anterior ao de `hoje`, em "YYYY-MM" - o mês que o job mensal fecha.
function mesReferenciaAnterior(hoje = new Date()) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function hojeData() {
  return new Date().toISOString().slice(0, 10);
}

function contextoVazio(alunoId, anoMes) {
  return {
    aluno_id: alunoId,
    gerado_em: hojeData(),
    cobre_ate: anoMes,
    linha_de_base: [],
    estado_atual: [],
    evolucao_relevante: [],
    marcos: [],
    hipoteses_abertas: [],
    lacunas: []
  };
}

// Contexto anterior carregado adiante sem alteração de conteúdo - só o
// cabeçalho (cobre_ate/gerado_em) é atualizado. Usado quando o mês tem
// dados insuficientes ou a chamada à IA falhou.
function contextoCarregadoAdiante(contextoAnterior, alunoId, anoMes) {
  if (!contextoAnterior) return contextoVazio(alunoId, anoMes);
  return { ...contextoAnterior, aluno_id: alunoId, cobre_ate: anoMes, gerado_em: hojeData() };
}

// Bloco das avaliações escritas pelo próprio personal (docs/adr/0015).
// Vazio quando não há nenhuma no recorte.
function blocoAvaliacoesPersonal(avaliacoesPersonal) {
  if (!avaliacoesPersonal.length) return "";
  const linhas = avaliacoesPersonal
    .map((avaliacao) => `[personal:${avaliacao.id} | escrita em ${new Date(avaliacao.created_at).toISOString().slice(0, 10)}]\n${avaliacao.texto}`)
    .join("\n\n");
  return `\n\n=== AVALIAÇÃO DO PERSONAL (escrita pelo profissional, ${avaliacoesPersonal.length}) ===\n${linhas}`;
}

// Monta o texto enviado à IA: contexto anterior + relatos do mês + avaliações
// do personal do mês. Avaliação física ainda NÃO entra aqui (fora do escopo
// atual); quando entrar, será outro bloco e uma dimensão em "estado_atual".
function montarPromptAvaliacao({ alunoId, anoMes, contextoAnterior, relatos, avaliacoesPersonal = [] }) {
  const blocoContexto = contextoAnterior
    ? JSON.stringify(contextoAnterior, null, 2)
    : "Nenhum - este é o primeiro ciclo de acompanhamento deste aluno.";

  const blocoRelatos = relatos
    .map((registro) => {
      const payload = registro.validacao?.payload_confirmado_json || {};
      const itens = Array.isArray(payload.itens) ? payload.itens : [];
      const linhasItens = itens.length
        ? itens.map((item) => `  - ${item.label}: ${item.valor}${item.obs ? ` (obs: ${item.obs})` : ""}`).join("\n")
        : "  - (nenhum item estruturado)";
      const nota = payload.notaGeral ? `\n  nota geral: ${payload.notaGeral}` : "";
      const sessao = registro.iniciado_em ? new Date(registro.iniciado_em).toISOString().slice(0, 10) : "?";
      const confirmado = registro.validacao?.confirmado_em
        ? new Date(registro.validacao.confirmado_em).toISOString().slice(0, 10)
        : "?";
      return `[relato:${registro.id} | sessão em ${sessao} | confirmado em ${confirmado}]\n${linhasItens}${nota}`;
    })
    .join("\n\n");

  return (
    [
      `ALUNO: ${alunoId}`,
      `MÊS DE REFERÊNCIA: ${anoMes}`,
      "",
      "=== CONTEXTO CONSOLIDADO (até o mês anterior) ===",
      blocoContexto,
      "",
      `=== RELATOS CONFIRMADOS DE ${anoMes} (${relatos.length}, na ordem de confirmação) ===`,
      blocoRelatos
    ].join("\n") + blocoAvaliacoesPersonal(avaliacoesPersonal)
  );
}

function avaliacaoDadosInsuficientes({ anoMes, limites, relatos }) {
  return {
    periodo: { ano_mes: anoMes, inicio: limites.inicioData, fim: limites.fimData },
    dados_insuficientes: true,
    relatos_considerados: relatos.length,
    resumo_geral:
      `Apenas ${relatos.length} relato(s) confirmado(s) em ${anoMes} - o mínimo para gerar a avaliação é ${MINIMO_RELATOS}. ` +
      "Ciclo registrado como dados insuficientes; o contexto consolidado do mês anterior foi mantido. " +
      "Para enriquecer o próximo ciclo, registre novos relatos normalmente.",
    dimensoes: [],
    destaques: [],
    alertas: [],
    recomendacoes: [],
    pendencias_confirmacao: [],
    mudancas_vs_mes_anterior: []
  };
}

// Gera (ou regenera) a avaliação de um aluno para um mês. Idempotente por
// (aluno, mês): sobrescreve a linha existente.
async function gerarParaAluno({ equipeId, alunoId, anoMes, origem = "automatica" }) {
  validarAnoMes(anoMes);

  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }

  const limites = limitesMes(anoMes);
  const anterior = await avaliacaoMensalRepository.obterAnteriorAoMes({ alunoId, anoMes });
  const contextoAnterior = anterior?.contexto_consolidado_json || null;

  const relatos = await avaliacaoMensalRepository.listarRelatosConfirmadosNoMes({
    equipeId,
    alunoId,
    inicio: limites.inicio,
    fim: limites.fim
  });

  const avaliacoesPersonal = await avaliacaoPersonalRepository.listarNoPeriodo({
    equipeId,
    alunoId,
    inicio: limites.inicio,
    fim: limites.fim
  });

  const base = {
    aluno_id: alunoId,
    equipe_id: equipeId,
    ano_mes: anoMes,
    periodo_inicio: limites.inicioData,
    periodo_fim: limites.fimData,
    origem,
    relatos_considerados: relatos.length,
    baseada_em_registro_ids: relatos.map((registro) => registro.id),
    // Só as que realmente foram para a IA (preenchido no caminho "gerada").
    avaliacoes_personal_consideradas: [],
    contexto_anterior_id: anterior?.id || null,
    provedor: "gemini"
  };

  if (relatos.length < MINIMO_RELATOS) {
    return avaliacaoMensalRepository.salvar({
      ...base,
      status: "dados_insuficientes",
      modelo: null,
      erro: null,
      avaliacao_json: avaliacaoDadosInsuficientes({ anoMes, limites, relatos }),
      contexto_consolidado_json: contextoCarregadoAdiante(contextoAnterior, alunoId, anoMes)
    });
  }

  try {
    const promptContexto = montarPromptAvaliacao({ alunoId, anoMes, contextoAnterior, relatos, avaliacoesPersonal });
    const { avaliacaoMensal, contextoConsolidado } = await geminiService.gerarAvaliacaoMensal({ promptContexto });

    if (!avaliacaoMensal || !contextoConsolidado) {
      throw new Error("Resposta da IA incompleta (sem avaliacao_mensal ou contexto_consolidado).");
    }

    return avaliacaoMensalRepository.salvar({
      ...base,
      status: "gerada",
      modelo: env.gemini.model,
      erro: null,
      avaliacoes_personal_consideradas: avaliacoesPersonal.map((avaliacao) => avaliacao.id),
      avaliacao_json: avaliacaoMensal,
      contexto_consolidado_json: {
        ...contextoConsolidado,
        aluno_id: alunoId,
        cobre_ate: anoMes
      }
    });
  } catch (err) {
    logger.error({ err, alunoId, anoMes }, "[avaliacao-mensal] falha ao gerar avaliação");
    return avaliacaoMensalRepository.salvar({
      ...base,
      status: "falha",
      modelo: env.gemini.model,
      erro: err.message,
      avaliacao_json: null,
      contexto_consolidado_json: contextoCarregadoAdiante(contextoAnterior, alunoId, anoMes)
    });
  }
}

module.exports = {
  MINIMO_RELATOS,
  gerarParaAluno,
  mesReferenciaAnterior,
  limitesMes,
  montarPromptAvaliacao
};
