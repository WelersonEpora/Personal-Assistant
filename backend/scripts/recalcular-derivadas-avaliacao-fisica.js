"use strict";

// docs/adr/0016: recalcula as métricas derivadas (imc, rcq, massa_gorda,
// massa_magra) de TODAS as avaliações físicas a partir das medidas `principal`.
// One-shot idempotente - usado para preencher massa_gorda/massa_magra nas 405
// avaliações importadas do BodyMove (o CRUD já recalcula na gravação; o
// importador também, numa reimportação futura).
//
// Uso: node scripts/recalcular-derivadas-avaliacao-fisica.js [--dry-run]

const models = require("../src/models");
const { AvaliacaoFisica, AvaliacaoFisicaMedida, sequelize } = models;
const { calcularDerivadas, DERIVADAS } = require("../src/services/avaliacao-fisica/metricas-derivadas");

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const avaliacoes = await AvaliacaoFisica.findAll({
    include: [{ model: AvaliacaoFisicaMedida, as: "medidas" }]
  });

  const rel = { avaliacoesVarridas: avaliacoes.length, derivadasCriadas: 0, derivadasAtualizadas: 0, semMudanca: 0 };

  for (const av of avaliacoes) {
    const principais = {};
    for (const m of av.medidas) {
      if (m.principal && !DERIVADAS.includes(m.metrica_codigo)) {
        principais[m.metrica_codigo] = Number(m.valor);
      }
    }
    const derivadas = calcularDerivadas(principais);
    const atuais = new Map(
      av.medidas.filter((m) => DERIVADAS.includes(m.metrica_codigo)).map((m) => [m.metrica_codigo, m])
    );

    for (const d of derivadas) {
      const existente = atuais.get(d.metrica_codigo);
      if (!existente) {
        rel.derivadasCriadas += 1;
        if (!dryRun) {
          // eslint-disable-next-line no-await-in-loop
          await AvaliacaoFisicaMedida.create({ ...d, avaliacao_fisica_id: av.id });
        }
      } else if (Number(existente.valor) !== d.valor) {
        rel.derivadasAtualizadas += 1;
        if (!dryRun) {
          // eslint-disable-next-line no-await-in-loop
          await existente.update({ valor: d.valor, principal: true, origem_valor: "calculado" });
        }
      } else {
        rel.semMudanca += 1;
      }
    }
  }

  console.log(dryRun ? "=== DRY-RUN (nada gravado) ===" : "=== Recálculo concluído ===");
  console.log(JSON.stringify(rel, null, 2));
}

main()
  .catch((err) => {
    console.error("Falha no recálculo:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
