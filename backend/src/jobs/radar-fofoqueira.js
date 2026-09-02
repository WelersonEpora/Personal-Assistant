"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md: agendador do Radar. Mesma
// mecânica do gerador-avaliacao-mensal.js (docs/adr/0015) - setInterval no
// próprio processo, roda no boot, sem dependência externa. Idempotência: só
// dispara se a última execução concluída foi há mais de ~6 dias (sobrevive a
// restart sem repetir a busca da semana).
//
// `RADAR_JOB_ATIVO=false` desliga só este agendador - a tela e o disparo
// manual do owner (POST /api/v1/radar/rodar) continuam.
const radarService = require("../services/radar.service");
const radarRepository = require("../repositories/radar.repository");
const env = require("../config/env");
const logger = require("../shared/logger");

const INTERVALO_CHECAGEM_MS = 24 * 60 * 60 * 1000; // checa 1x/dia
const MIN_HORAS_ENTRE_CICLOS = 6 * 24;

async function rodarSeVencido() {
  try {
    const ultima = await radarRepository.ultimaExecucaoConcluida();
    if (ultima && ultima.concluida_em) {
      const horas = (Date.now() - new Date(ultima.concluida_em).getTime()) / (60 * 60 * 1000);
      if (horas < MIN_HORAS_ENTRE_CICLOS) {
        return;
      }
    }
    await radarService.rodarCiclo();
  } catch (err) {
    // rodarCiclo já não relança; este catch cobre falha ao consultar a última
    // execução. Nunca derruba o processo (mesmo princípio da docs/adr/0009).
    logger.error({ err }, "[radar-fofoqueira] falha ao rodar ciclo agendado");
  }
}

let timer = null;

function iniciarAgendadorRadar() {
  if (timer) return;
  if (!env.radar.jobAtivo) {
    logger.info("[radar-fofoqueira] agendador desativado (RADAR_JOB_ATIVO=false)");
    return;
  }
  rodarSeVencido();
  timer = setInterval(rodarSeVencido, INTERVALO_CHECAGEM_MS);
  if (timer.unref) timer.unref();
  logger.info("[radar-fofoqueira] agendador iniciado");
}

module.exports = { iniciarAgendadorRadar, rodarSeVencido };
