"use strict";

// docs/adr/0019: validação da data do atendimento quando ela vem do "Editar"
// da revisão (desktop). Janela: [iniciado_em::date - 60, hoje] - nunca futura,
// nunca mais de 60 dias antes do início da captura. É mais folgada que a janela
// de 7 dias da CAPTURA (registro-sync.service.js) de propósito: no desktop o
// personal está pondo o backlog em dia, com calendário e histórico à vista.
// 60 = mesmo horizonte de JANELA_SEM_MENSAL_DIAS da análise sob demanda.
const { ValidationError } = require("../errors");

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_RETROATIVOS_REVISAO = 60;

function apenasData(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function somarDias(dataYmd, dias) {
  const d = new Date(`${dataYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// `iniciadoEm` opcional: quando informado, o piso é `iniciadoEm::date - 60`;
// senão, `hoje - 60` (as duas âncoras quase coincidem - o relato costuma ser
// revisado poucos dias depois da captura).
function validarDataAtendimentoPassada(valor, iniciadoEm) {
  if (typeof valor !== "string" || !FORMATO_DATA.test(valor)) {
    throw new ValidationError('"dataAtendimento" deve estar no formato AAAA-MM-DD.');
  }
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new ValidationError('"dataAtendimento" é uma data inválida.');
  }
  const hoje = apenasData(new Date());
  const ancora = iniciadoEm ? apenasData(iniciadoEm) : hoje;
  const minima = somarDias(ancora, -DIAS_RETROATIVOS_REVISAO);
  if (valor > hoje) {
    throw new ValidationError("A data do atendimento não pode ser no futuro.");
  }
  if (valor < minima) {
    throw new ValidationError(
      `A data do atendimento não pode ser anterior a ${minima} (até ${DIAS_RETROATIVOS_REVISAO} dias antes do registro).`
    );
  }
  return valor;
}

module.exports = { validarDataAtendimentoPassada, DIAS_RETROATIVOS_REVISAO };
