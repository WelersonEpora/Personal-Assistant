"use strict";

// docs/adr/0016 (proposta v3 §5): `anamnese_json` e `postural_json` guardam só
// dado qualitativo/contextual, com CHAVES ENUMERADAS e validação na escrita -
// chave fora do esquema é rejeitada (não é depósito genérico). Este módulo é a
// fonte da verdade dessa validação; o formulário do frontend espelha as listas.

const { ValidationError } = require("../../shared/errors");

// --- anamnese (§5.1) ------------------------------------------------------

function str(v, chave) {
  if (typeof v !== "string") throw new ValidationError(`anamnese_json.${chave} deve ser texto.`);
  return v.trim();
}
function bool(v, chave) {
  if (typeof v !== "boolean") throw new ValidationError(`anamnese_json.${chave} deve ser booleano.`);
  return v;
}
function inteiro(v, chave) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new ValidationError(`anamnese_json.${chave} deve ser um inteiro >= 0.`);
  }
  return v;
}

const HISTORICO_FAMILIAR_SUGERIDO = ["cardiopatia", "hipertensao", "diabetes", "dislipidemia", "obesidade"];

// chave -> { validar(valor) -> valorNormalizado | undefined (= descartar) }
const ANAMNESE_CHAVES = {
  objetivo: (v) => str(v, "objetivo") || undefined,
  pratica_atividade: (v) => bool(v, "pratica_atividade"),
  atividade_tipo: (v) => str(v, "atividade_tipo") || undefined,
  atividade_frequencia_semanal: (v) => inteiro(v, "atividade_frequencia_semanal"),
  restricoes: (v) => str(v, "restricoes") || undefined,
  medicamentos: (v) => str(v, "medicamentos") || undefined,
  dores_queixas: (v) => str(v, "dores_queixas") || undefined,
  cirurgias_lesoes: (v) => str(v, "cirurgias_lesoes") || undefined,
  consumo_alcool: (v) => str(v, "consumo_alcool") || undefined,
  dieta_orientacao: (v) => str(v, "dieta_orientacao") || undefined,
  alergias: (v) => str(v, "alergias") || undefined,
  observacoes: (v) => str(v, "observacoes") || undefined,
  historico_familiar: (v) => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      throw new ValidationError("anamnese_json.historico_familiar deve ser uma lista de textos.");
    }
    const limpo = v.map((x) => x.trim()).filter(Boolean);
    return limpo.length ? limpo : undefined;
  },
  tabagismo: (v) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      throw new ValidationError("anamnese_json.tabagismo deve ser um objeto.");
    }
    const permitidas = ["fuma", "cigarros_dia", "tempo"];
    const desconhecida = Object.keys(v).find((k) => !permitidas.includes(k));
    if (desconhecida) throw new ValidationError(`anamnese_json.tabagismo: chave desconhecida "${desconhecida}".`);
    const out = {};
    if (v.fuma !== undefined) out.fuma = bool(v.fuma, "tabagismo.fuma");
    if (v.cigarros_dia !== undefined && v.cigarros_dia !== null) out.cigarros_dia = inteiro(v.cigarros_dia, "tabagismo.cigarros_dia");
    if (v.tempo !== undefined && v.tempo !== null) {
      const t = String(v.tempo).trim();
      if (t) out.tempo = t;
    }
    return Object.keys(out).length ? out : undefined;
  }
};

function validarAnamneseJson(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    throw new ValidationError("anamnese_json deve ser um objeto.");
  }
  const out = {};
  for (const [chave, valor] of Object.entries(obj)) {
    const validar = ANAMNESE_CHAVES[chave];
    if (!validar) throw new ValidationError(`anamnese_json: chave desconhecida "${chave}".`);
    if (valor === undefined || valor === null) continue;
    const normalizado = validar(valor);
    if (normalizado !== undefined) out[chave] = normalizado;
  }
  return Object.keys(out).length ? out : null;
}

// --- postural (§5.2) ----------------------------------------------------

// Estrutura fixa por região; toda folha é boolean, exceto `observacoes` (string).
const POSTURAL_ESQUEMA = {
  coluna: ["hiperlordose_cervical", "hipercifose", "hiperlordose_lombar", "escoliose"],
  ombros_escapulas: [
    "rotacao_interna",
    "protracao_escapular",
    "retracao_escapular",
    "depressao_escapular",
    "ombros_assimetricos",
    "encurtamento_trapezio"
  ],
  tronco: ["protrusao_abdominal", "triangulo_tales_assimetrico"],
  quadril: ["desvio_lateral", "assimetria"],
  joelho: { direito: ["flexo", "recurvato", "valgo", "varo"], esquerdo: ["flexo", "recurvato", "valgo", "varo"] },
  pe: {
    direito: ["plano", "cavo", "valgo", "varo", "calcaneo", "equino"],
    esquerdo: ["plano", "cavo", "valgo", "varo", "calcaneo", "equino"]
  }
};

function validarRegiaoPlana(entrada, permitidas, caminho) {
  if (entrada === null || typeof entrada !== "object" || Array.isArray(entrada)) {
    throw new ValidationError(`postural_json.${caminho} deve ser um objeto.`);
  }
  const out = {};
  for (const [k, v] of Object.entries(entrada)) {
    if (!permitidas.includes(k)) throw new ValidationError(`postural_json.${caminho}: chave desconhecida "${k}".`);
    if (typeof v !== "boolean") throw new ValidationError(`postural_json.${caminho}.${k} deve ser booleano.`);
    out[k] = v;
  }
  return out;
}

function validarPosturalJson(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    throw new ValidationError("postural_json deve ser um objeto.");
  }
  const out = {};
  for (const [regiao, valor] of Object.entries(obj)) {
    if (regiao === "observacoes") {
      if (valor === null || valor === undefined) continue;
      if (typeof valor !== "string") throw new ValidationError("postural_json.observacoes deve ser texto.");
      const t = valor.trim();
      if (t) out.observacoes = t;
      continue;
    }
    const def = POSTURAL_ESQUEMA[regiao];
    if (!def) throw new ValidationError(`postural_json: região desconhecida "${regiao}".`);
    if (valor === null || valor === undefined) continue;

    if (Array.isArray(def)) {
      const r = validarRegiaoPlana(valor, def, regiao);
      if (Object.keys(r).length) out[regiao] = r;
    } else {
      if (typeof valor !== "object" || Array.isArray(valor)) {
        throw new ValidationError(`postural_json.${regiao} deve ser um objeto.`);
      }
      const sub = {};
      for (const [lado, val] of Object.entries(valor)) {
        if (!def[lado]) throw new ValidationError(`postural_json.${regiao}: lado desconhecido "${lado}".`);
        if (val === null || val === undefined) continue;
        const r = validarRegiaoPlana(val, def[lado], `${regiao}.${lado}`);
        if (Object.keys(r).length) sub[lado] = r;
      }
      if (Object.keys(sub).length) out[regiao] = sub;
    }
  }
  return Object.keys(out).length ? out : null;
}

module.exports = {
  ANAMNESE_CHAVES,
  HISTORICO_FAMILIAR_SUGERIDO,
  POSTURAL_ESQUEMA,
  validarAnamneseJson,
  validarPosturalJson
};
