"use strict";

// docs/adr/0022 (adendo): dispara um ciclo do Radar na hora. O feed é global
// (compartilhado por todos os tenants), então rodar a busca é ação de
// OPERADOR do sistema - não de dono de equipe. Sem endpoint; só este script.
// O job semanal (jobs/radar-fofoqueira.js) é o gatilho normal de produção.
//
// Uso: npm run radar:rodar

const { sequelize } = require("../src/models");
const radarService = require("../src/services/radar.service");

async function main() {
  const r = await radarService.rodarCiclo();
  console.log(JSON.stringify(r, null, 2));
  if (r.status === "falha") process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Falha ao rodar o ciclo do Radar:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
