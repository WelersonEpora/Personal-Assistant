"use strict";

const app = require("./app");
const env = require("./config/env");
const logger = require("./shared/logger");
const { reenfileirarRegistrosPendentes } = require("./jobs/processador-fila-ia");
const { iniciarAgendador: iniciarAgendadorAvaliacaoMensal } = require("./jobs/gerador-avaliacao-mensal");

app.listen(env.appPort, () => {
  logger.info(`Personal Assistant backend rodando na porta ${env.appPort}`);

  // docs/adr/0009: um Registro parado em recebido/transcrevendo/interpretando
  // por causa de um restart do processo precisa voltar pra fila sozinho, sem
  // intervenção manual.
  reenfileirarRegistrosPendentes().catch((err) => {
    logger.error({ err }, "Falha ao reenfileirar Registros pendentes na inicializacao");
  });

  // docs/adr/0015: lote mensal das avaliações do mês anterior. Idempotente
  // e com falha isolada por aluno - roda no boot e a cada 6h.
  iniciarAgendadorAvaliacaoMensal();
});
