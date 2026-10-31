"use strict";

// Forma de comparação de nomes digitados/falados (docs/adr/0027): minúsculas,
// sem acento, espaços colapsados. "Tríceps  Corda" e "triceps corda" são o
// mesmo apelido. Espelho em frontend/src/utils/buscaExercicio.js.
function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizarTexto };
