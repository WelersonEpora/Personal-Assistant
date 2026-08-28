"use strict";

// docs/adr/0016: valida a transformação contra o arquivo REAL do BodyMove.
// O .bak tem PII/dados de saúde e é gitignore - este teste é PULADO quando o
// arquivo não está presente (é o caso na CI).

const path = require("node:path");
const fs = require("node:fs");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const ARQUIVO = path.resolve(__dirname, "..", "..", "Legado", "BodyMove", "bodymove.bak");
const disponivel = fs.existsSync(ARQUIVO);

test("transformação do bodymove.bak real: 147 alunos, 405 avaliações, principal único", { skip: disponivel ? false : "bodymove.bak ausente" }, () => {
  const MDBReader = require("mdb-reader").default || require("mdb-reader");
  const {
    transformarLegado,
    TABELAS_GORDURA,
    TABELAS_VO2
  } = require("../src/services/avaliacao-fisica/importador-bodymove");

  const nomes = ["cadastro", "avaliacao", "antropometria", "dobras", "anamnese_base", "postural", ...TABELAS_GORDURA, ...TABELAS_VO2];
  const reader = new MDBReader(fs.readFileSync(ARQUIVO));
  const disp = new Set(reader.getTableNames());
  const tabelas = {};
  for (const n of nomes) tabelas[n] = disp.has(n) ? reader.getTable(n).getData() : [];

  const { alunos, avisos } = transformarLegado(tabelas);

  assert.equal(alunos.length, 147);
  assert.equal(
    alunos.reduce((acc, a) => acc + a.avaliacoes.length, 0),
    405
  );

  const totalMedidas = alunos.reduce((acc, a) => acc + a.avaliacoes.reduce((s, av) => s + av.medidas.length, 0), 0);
  assert.ok(totalMedidas > 9000 && totalMedidas < 14000, `medidas fora da faixa esperada: ${totalMedidas}`);

  // no máximo um `principal` por métrica em cada avaliação
  for (const a of alunos) {
    for (const av of a.avaliacoes) {
      const principaisPorMetrica = {};
      for (const m of av.medidas) {
        if (m.principal) {
          principaisPorMetrica[m.metrica_codigo] = (principaisPorMetrica[m.metrica_codigo] || 0) + 1;
          assert.ok(principaisPorMetrica[m.metrica_codigo] === 1, `${a.nomeOriginal} ${av.dataISO}: 2 principais de ${m.metrica_codigo}`);
        }
      }
    }
  }

  // todas as avaliações têm peso e altura (o legado sempre tem antropometria)
  const semPeso = alunos.flatMap((a) => a.avaliacoes).filter((av) => !av.medidas.some((m) => m.metrica_codigo === "peso"));
  assert.equal(semPeso.length, 0);

  // avisos: só os poucos casos de texto livre não parseável
  assert.ok(avisos.length <= 10, `avisos demais: ${avisos.length}\n${avisos.join("\n")}`);
});
