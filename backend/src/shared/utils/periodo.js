"use strict";

// Validação de datas "AAAA-MM-DD" vindas de query string (filtros de período
// de listagem/relatório). Formato + data real (rejeita 2026-13-01, 2026-02-30).
// Usado pela tela de Atendimentos (docs/adr/0020) e pelo filtro do Histórico.
const { ValidationError } = require("../errors");

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function validarDataIso(valor, campo) {
  if (!FORMATO_DATA.test(valor)) {
    throw new ValidationError(`"${campo}" precisa estar no formato AAAA-MM-DD.`);
  }
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new ValidationError(`"${campo}" não é uma data válida.`);
  }
  return valor;
}

module.exports = { validarDataIso };
