"use strict";

const app = require("./app");
const env = require("./config/env");
const logger = require("./shared/logger");
const { reenfileirarRegistrosPendentes } = require("./jobs/processador-fila-ia");

app.listen(env.appPort, () => {
  logger.info(`Personal Assistant backend rodando na porta ${env.appPort}`);

  // docs/adr/0009: um Registro parado em recebido/transcrevendo/interpretando
  // por causa de um restart do processo precisa voltar pra fila sozinho, sem
  // intervenção manual.
  reenfileirarRegistrosPendentes().catch((err) => {
    logger.error({ err }, "Falha ao reenfileirar Registros pendentes na inicializacao");
  });
});
