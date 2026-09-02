"use strict";

// docs/adr/0022 (adendo): log das últimas execuções do Radar - observabilidade
// da calibração (o que a busca recebeu, publicou, descartou e por quê).
// Ação de operador; sem endpoint. `--prompt` inclui o prompt e a resposta crua.
//
// Uso: npm run radar:execucoes [-- --prompt]

const { sequelize } = require("../src/models");
const radarService = require("../src/services/radar.service");

async function main() {
  const comPrompt = process.argv.includes("--prompt");
  const execucoes = await radarService.listarExecucoes();
  if (!execucoes.length) {
    console.log("nenhuma execução ainda.");
    return;
  }
  for (const e of execucoes) {
    console.log(
      `\n${e.iniciada_em}  [${e.status}]  modelo=${e.modelo || "-"}  ` +
        `recebidos=${e.itens_recebidos}  publicados=${e.itens_publicados}`
    );
    if (e.descartes && e.descartes.length) {
      for (const d of e.descartes) console.log(`   descartado (${d.motivo}): ${d.titulo}`);
    }
    if (e.erro) console.log(`   erro: ${e.erro}`);
    if (comPrompt) {
      console.log(`   --- prompt ---\n${e.prompt || "(vazio)"}`);
      console.log(`   --- resposta crua ---\n${e.resposta_crua || "(vazia)"}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Falha ao listar execuções:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
