"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md
//
// Análise sob demanda: o personal pede uma leitura pontual da IA a qualquer
// momento. Limite de 1 análise GERADA a cada 7 dias por aluno. Esta análise:
//   - NÃO substitui o acompanhamento mensal;
//   - NÃO altera o contexto consolidado do ciclo mensal (usa a versão mais
//     recente apenas como referência, somente leitura);
//   - NUNCA é dado oficial (docs/adr/0007).
// Toda solicitação registra data/hora, aluno e quem pediu.
const analiseSobDemandaRepository = require("../repositories/analiseSobDemanda.repository");
const alunoRepository = require("../repositories/aluno.repository");
const geminiService = require("./ia/gemini.service");
const env = require("../config/env");
const logger = require("../shared/logger");
const { NotFoundError, ConflictError } = require("../shared/errors");

const INTERVALO_DIAS = 7;
// Sem nenhum fechamento mensal ainda: olha os relatos confirmados dos
// últimos N dias, para não enviar um histórico ilimitado.
const JANELA_SEM_MENSAL_DIAS = 60;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// 1º dia do mês seguinte a "YYYY-MM" - fronteira exata do que o ciclo mensal
// já consolidou.
function inicioAposMes(anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  return new Date(ano, mes, 1);
}

function proximaDisponivelApos(solicitadaEm) {
  return new Date(new Date(solicitadaEm).getTime() + INTERVALO_DIAS * MS_POR_DIA);
}

// Situação do limite de 7 dias para um aluno.
async function disponibilidade({ alunoId }) {
  const ultima = await analiseSobDemandaRepository.ultimaGerada({ alunoId });
  if (!ultima) {
    return { disponivel_agora: true, proxima_disponivel_em: null, ultima_gerada_em: null };
  }
  const proxima = proximaDisponivelApos(ultima.solicitada_em);
  return {
    disponivel_agora: Date.now() >= proxima.getTime(),
    proxima_disponivel_em: proxima.toISOString(),
    ultima_gerada_em: new Date(ultima.solicitada_em).toISOString()
  };
}

function formatarRelato(registro) {
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
}

function montarPromptAnalise({ alunoId, contextoReferencia, relatos }) {
  const blocoContexto = contextoReferencia
    ? JSON.stringify(contextoReferencia, null, 2)
    : "Nenhum - o aluno ainda não teve um fechamento mensal.";

  return [
    `ALUNO: ${alunoId}`,
    `DATA DA ANÁLISE: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "=== CONTEXTO CONSOLIDADO (último fechamento mensal, somente referência) ===",
    blocoContexto,
    "",
    `=== RELATOS CONFIRMADOS RECENTES (${relatos.length}, ainda não consolidados, na ordem de confirmação) ===`,
    relatos.map(formatarRelato).join("\n\n")
  ].join("\n");
}

// Resultado NÃO persistido: nada chegou a ser produzido, então não vira
// registro formal e não consome a janela de 7 dias (docs/adr/0015). O
// frontend mostra `mensagem` ao personal.
function resultadoInsuficiente({ relatosConsiderados, mensagem }) {
  return { status: "dados_insuficientes", persistida: false, relatos_considerados: relatosConsiderados, mensagem };
}

async function solicitar({ equipeId, alunoId, usuarioId }) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }

  const ultima = await analiseSobDemandaRepository.ultimaGerada({ alunoId });
  if (ultima) {
    const proxima = proximaDisponivelApos(ultima.solicitada_em);
    if (Date.now() < proxima.getTime()) {
      throw new ConflictError(
        `Já houve uma análise sob demanda para este aluno nos últimos ${INTERVALO_DIAS} dias. ` +
          `Uma nova estará disponível em ${proxima.toLocaleDateString("pt-BR")}.`,
        { proxima_disponivel_em: proxima.toISOString() }
      );
    }
  }

  const mensalMaisRecente = await analiseSobDemandaRepository.avaliacaoMensalMaisRecente({ alunoId });
  const contextoReferencia = mensalMaisRecente?.contexto_consolidado_json || null;
  const desde = mensalMaisRecente
    ? inicioAposMes(mensalMaisRecente.ano_mes)
    : new Date(Date.now() - JANELA_SEM_MENSAL_DIAS * MS_POR_DIA);

  const relatos = await analiseSobDemandaRepository.listarRelatosConfirmadosDesde({ equipeId, alunoId, desde });

  const base = {
    aluno_id: alunoId,
    equipe_id: equipeId,
    solicitada_por: usuarioId,
    solicitada_em: new Date(),
    relatos_considerados: relatos.length,
    baseada_em_registro_ids: relatos.map((registro) => registro.id),
    contexto_referencia_id: mensalMaisRecente?.id || null,
    provedor: "gemini"
  };

  // Sem relato recente: não chega a chamar a IA -> não registra nada e não
  // consome a janela de 7 dias. Só informa o personal.
  if (relatos.length === 0) {
    logger.info({ alunoId, usuarioId }, "[analise-sob-demanda] solicitação sem relatos recentes - não registrada");
    return resultadoInsuficiente({
      relatosConsiderados: 0,
      mensagem:
        "Não há relatos confirmados recentes o suficiente para uma análise. " +
        "Registre e confirme novos relatos e solicite novamente - nada foi consumido."
    });
  }

  try {
    const promptContexto = montarPromptAnalise({ alunoId, contextoReferencia, relatos });
    const { analise } = await geminiService.gerarAnaliseSobDemanda({ promptContexto });
    if (!analise) {
      throw new Error("Resposta da IA incompleta (sem 'analise').");
    }

    // A IA pode julgar que os dados não sustentam uma conclusão. Também não
    // vira registro formal nem consome a janela - só a mensagem ao personal.
    if (analise.dados_insuficientes) {
      logger.info({ alunoId, usuarioId }, "[analise-sob-demanda] IA julgou dados insuficientes - não registrada");
      return resultadoInsuficiente({
        relatosConsiderados: relatos.length,
        mensagem:
          analise.resumo_geral ||
          "Os relatos recentes não sustentam uma análise conclusiva. Nada foi consumido - tente novamente após novos relatos."
      });
    }

    return analiseSobDemandaRepository.criar({
      ...base,
      status: "gerada",
      modelo: env.gemini.model,
      erro: null,
      analise_json: analise
    });
  } catch (err) {
    logger.error({ err, alunoId }, "[analise-sob-demanda] falha ao gerar análise");
    return analiseSobDemandaRepository.criar({
      ...base,
      status: "falha",
      modelo: env.gemini.model,
      erro: err.message,
      analise_json: null
    });
  }
}

async function listar({ equipeId, alunoId }) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }
  const analises = await analiseSobDemandaRepository.listarPorAluno({ alunoId, equipeId });
  return { analises, disponibilidade: await disponibilidade({ alunoId }) };
}

module.exports = { INTERVALO_DIAS, solicitar, listar, disponibilidade, montarPromptAnalise };
