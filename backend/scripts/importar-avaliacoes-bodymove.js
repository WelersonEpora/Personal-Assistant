"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md: importador one-shot
// das 405 avaliações do BodyMove (Access Jet 3.0). Roda na máquina do dev
// apontando para o banco alvo - o .bak tem PII/dados de saúde reais, é
// gitignore e nunca entra na imagem de produção.
//
// Uso:
//   node scripts/importar-avaliacoes-bodymove.js [--arquivo=caminho] [--equipe-id=uuid] [--dry-run]
//
// - --arquivo   default: Legado/BodyMove/bodymove.bak (relativo à raiz do repo)
// - --equipe-id se omitido e existir exatamente 1 equipe, usa ela
// - --dry-run   transforma e imprime o relatório sem gravar (ROLLBACK)
//
// Idempotente: rodar de novo -> tudo "jaExistentes", 0 novas.

const path = require("node:path");
const fs = require("node:fs");
const MDBReader = require("mdb-reader").default || require("mdb-reader");

const models = require("../src/models");
const { transformarLegado, persistir, TABELAS_GORDURA, TABELAS_VO2 } = require("../src/services/avaliacao-fisica/importador-bodymove");

const TABELAS_LEGADO = [
  "cadastro",
  "avaliacao",
  "antropometria",
  "dobras",
  "anamnese_base",
  "postural",
  ...TABELAS_GORDURA,
  ...TABELAS_VO2
];

function lerArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

function lerTabelas(arquivo) {
  const buffer = fs.readFileSync(arquivo);
  const reader = new MDBReader(buffer);
  const disponiveis = new Set(reader.getTableNames());
  const tabelas = {};
  for (const nome of TABELAS_LEGADO) {
    tabelas[nome] = disponiveis.has(nome) ? reader.getTable(nome).getData() : [];
  }
  return tabelas;
}

async function resolverEquipeId(informado) {
  if (informado) return informado;
  const equipes = await models.Equipe.findAll({ attributes: ["id", "nome"] });
  if (equipes.length === 1) {
    console.log(`--equipe-id não informado; usando a única equipe: ${equipes[0].id} ("${equipes[0].nome}")`);
    return equipes[0].id;
  }
  throw new Error(
    `Informe --equipe-id: há ${equipes.length} equipes no banco (${equipes.map((e) => e.id).join(", ")}).`
  );
}

async function main() {
  const args = lerArgs();
  const dryRun = Boolean(args["dry-run"]);
  const raizRepo = path.resolve(__dirname, "..", "..");
  const arquivo = path.resolve(raizRepo, args.arquivo || "Legado/BodyMove/bodymove.bak");

  if (!fs.existsSync(arquivo)) {
    throw new Error(`Arquivo do legado não encontrado: ${arquivo}`);
  }

  const equipeId = await resolverEquipeId(args["equipe-id"]);

  console.log(`Lendo ${arquivo} ...`);
  const tabelas = lerTabelas(arquivo);
  console.log(
    `  cadastro=${tabelas.cadastro.length} avaliacao=${tabelas.avaliacao.length} antropometria=${tabelas.antropometria.length}`
  );

  const { alunos, avisos } = transformarLegado(tabelas);
  const totalAvaliacoes = alunos.reduce((acc, a) => acc + a.avaliacoes.length, 0);
  const totalMedidas = alunos.reduce((acc, a) => acc + a.avaliacoes.reduce((s, av) => s + av.medidas.length, 0), 0);
  console.log(`Transformados: ${alunos.length} alunos, ${totalAvaliacoes} avaliações, ${totalMedidas} medidas.`);

  const relatorio = await persistir({ alunos }, { equipeId, dryRun, models });

  console.log(dryRun ? "\n=== DRY-RUN (nada gravado) ===" : "\n=== Import concluído ===");
  console.log(JSON.stringify(relatorio, null, 2));

  if (avisos.length > 0) {
    console.log(`\n${avisos.length} aviso(s):`);
    for (const aviso of avisos) console.log(`  - ${aviso}`);
  }
}

main()
  .catch((err) => {
    console.error("Falha na importação:", err.message);
    process.exitCode = 1;
  })
  .finally(() => models.sequelize.close());
