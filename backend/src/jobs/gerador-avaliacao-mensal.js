"use strict";

// docs/adr/0015-acompanhamento-individual-mensal.md: geração automática das
// avaliações mensais. Diferente do pipeline de Registro (docs/adr/0009 - fila
// reativa a cada sincronização), este é um lote mensal, mais próximo de um
// job agendado. Sem dependência externa: um setInterval no próprio processo,
// idempotente - só gera o que ainda falta.
const avaliacaoMensalService = require("../services/avaliacao-mensal.service");
const avaliacaoMensalRepository = require("../repositories/avaliacaoMensal.repository");
const logger = require("../shared/logger");

// A cada 6h. Como gerarAvaliacoesDoMes é idempotente, rodar de novo no mesmo
// mês só varre alunos já prontos e sai barato - e recolhe relatos do mês de
// referência confirmados com atraso (retenta "dados_insuficientes").
const INTERVALO_CHECAGEM_MS = 6 * 60 * 60 * 1000;

async function gerarAvaliacoesDoMes(anoMes) {
  const alunos = await avaliacaoMensalRepository.listarAlunosAtivos();
  let geradas = 0;
  let ignoradas = 0;

  for (const aluno of alunos) {
    const existente = await avaliacaoMensalRepository.obterPorMes({
      alunoId: aluno.id,
      equipeId: aluno.equipe_id,
      anoMes
    });

    // "gerada" nunca é refeita sozinha (é um retrato - relato atrasado só entra
    // se o personal regerar). "falha" é retentada sempre; "dados_insuficientes"
    // só quando relatos confirmados com atraso completaram o mínimo do mês
    // (docs/adr/0015, adendo 2026-11-02 - o mês é o do atendimento).
    if (existente && existente.status !== "falha") {
      const retentar =
        existente.status === "dados_insuficientes" &&
        (await avaliacaoMensalService.contarRelatosDoMes({
          equipeId: aluno.equipe_id,
          alunoId: aluno.id,
          anoMes
        })) >= avaliacaoMensalService.MINIMO_RELATOS;
      if (!retentar) {
        ignoradas += 1;
        continue;
      }
    }

    try {
      await avaliacaoMensalService.gerarParaAluno({
        equipeId: aluno.equipe_id,
        alunoId: aluno.id,
        anoMes,
        origem: "automatica"
      });
      geradas += 1;
    } catch (err) {
      // Falha isolada por aluno - não derruba o lote (mesmo princípio do
      // pipeline de IA, docs/adr/0009).
      logger.error({ err, alunoId: aluno.id, anoMes }, "[gerador-avaliacao-mensal] falha isolada ao gerar avaliação");
    }
  }

  logger.info({ anoMes, geradas, ignoradas, total: alunos.length }, "[gerador-avaliacao-mensal] ciclo mensal concluído");
  return { geradas, ignoradas, total: alunos.length };
}

async function rodarCicloDoMesAnterior() {
  const anoMes = avaliacaoMensalService.mesReferenciaAnterior();
  try {
    await gerarAvaliacoesDoMes(anoMes);
  } catch (err) {
    logger.error({ err, anoMes }, "[gerador-avaliacao-mensal] falha ao rodar ciclo mensal");
  }
}

let timer = null;

function iniciarAgendador() {
  if (timer) return;
  rodarCicloDoMesAnterior();
  timer = setInterval(rodarCicloDoMesAnterior, INTERVALO_CHECAGEM_MS);
  if (timer.unref) timer.unref();
  logger.info("[gerador-avaliacao-mensal] agendador iniciado");
}

module.exports = { iniciarAgendador, gerarAvaliacoesDoMes };
