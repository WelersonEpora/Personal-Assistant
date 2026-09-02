"use strict";

// docs/adr/0022 (adendo): curadoria do operador. Some com um item ruim do
// feed (visivel = false) sem apagar o histórico. `--reexibir` faz o inverso.
// O feed é global; curar é do operador, não de dono de equipe.
//
// Uso: npm run radar:ocultar -- <id-do-item> [--reexibir]

const { sequelize } = require("../src/models");
const radarRepository = require("../src/repositories/radar.repository");

async function main() {
  const id = process.argv.find((a) => /^[0-9a-f-]{36}$/i.test(a));
  const reexibir = process.argv.includes("--reexibir");
  if (!id) {
    console.error("Uso: npm run radar:ocultar -- <id-do-item> [--reexibir]");
    process.exitCode = 1;
    return;
  }
  const [afetados] = await radarRepository.definirVisibilidade(id, reexibir);
  if (afetados) {
    console.log(`item ${id} -> visivel = ${reexibir}`);
  } else {
    console.error(`nenhum item com id ${id}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Falha ao alterar visibilidade:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
