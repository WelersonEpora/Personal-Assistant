"use strict";

// docs/adr/0028-ficha-de-treino-por-captura-e-ia.md: a parte determinística da
// ficha por voz, sem IA e sem banco (testável). A IA nunca vê nem devolve
// UUID: cada exercício vai no prompt com uma referência curta (E1, E2…) e a
// resposta é traduzida aqui - referência que não existe vira "não reconhecido".

const TIPOS_GRUPO = ["simples", "biset", "triset", "circuito"];
const CONFIANCAS = ["alta", "media", "baixa"];
const LIMITE_TEXTO_CURTO = 30;

// exercicios: catálogo visível da equipe (com `apelidos`). Só os ativos entram
// - inativo não pode ir para ficha nova (exercicio.repository).
function montarCatalogoParaPrompt(exercicios) {
  const porRef = new Map();
  const linhas = [];
  exercicios
    .filter((exercicio) => exercicio.ativo)
    .forEach((exercicio, indice) => {
      const ref = `E${indice + 1}`;
      porRef.set(ref, exercicio.id);
      const apelidos = (exercicio.apelidos || []).map((a) => a.apelido);
      const detalhes = [exercicio.grupo_muscular, exercicio.equipamento].filter(Boolean).join(", ");
      linhas.push(
        `${ref}: ${exercicio.nome}${detalhes ? ` (${detalhes})` : ""}${apelidos.length ? ` — também chamado: ${apelidos.join("; ")}` : ""}`
      );
    });
  return { texto: linhas.join("\n"), porRef };
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function textoCurto(valor) {
  return texto(valor).slice(0, LIMITE_TEXTO_CURTO);
}

function inteiroPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 ? numero : null;
}

// Tipo coerente com a quantidade de itens (docs/adr/0026): a IA às vezes diz
// "bi-set" para três exercícios. Nesse caso vale a quantidade, não o rótulo.
function tipoDoGrupo(tipoDito, quantidade) {
  if (quantidade <= 1) return "simples";
  if (tipoDito === "biset" && quantidade === 2) return "biset";
  if (tipoDito === "triset" && quantidade === 3) return "triset";
  if (tipoDito === "circuito") return "circuito";
  if (quantidade === 2) return "biset";
  if (quantidade === 3) return "triset";
  return "circuito";
}

function traduzirItem(bruto, porRef) {
  const ref = texto(bruto?.exercicio_ref).toUpperCase();
  return {
    exercicio_id: porRef.get(ref) || null,
    nome_ouvido: texto(bruto?.nome_ouvido),
    repeticoes: textoCurto(bruto?.repeticoes),
    carga_obs: texto(bruto?.carga_obs),
    confianca: CONFIANCAS.includes(bruto?.confianca) ? bruto.confianca : "baixa",
    trecho_origem: texto(bruto?.trecho_origem)
  };
}

function traduzirGrupo(bruto, porRef) {
  const itens = (Array.isArray(bruto?.itens) ? bruto.itens : [])
    .map((item) => traduzirItem(item, porRef))
    .filter((item) => item.exercicio_id || item.nome_ouvido);
  if (!itens.length) return null;
  const tipoDito = TIPOS_GRUPO.includes(bruto?.tipo) ? bruto.tipo : "simples";
  return {
    tipo: tipoDoGrupo(tipoDito, itens.length),
    series: inteiroPositivo(bruto?.series),
    descanso: textoCurto(bruto?.descanso),
    observacoes: texto(bruto?.observacoes),
    itens
  };
}

// Resposta bruta da IA -> payload_json da proposta_ficha_treino. Ficha sem
// nenhum exercício é descartada (não há o que revisar).
function traduzirProposta(bruto, porRef) {
  const fichas = (Array.isArray(bruto?.fichas) ? bruto.fichas : [])
    .map((ficha) => ({
      nome: texto(ficha?.nome),
      observacoes: texto(ficha?.observacoes),
      grupos: (Array.isArray(ficha?.grupos) ? ficha.grupos : []).map((grupo) => traduzirGrupo(grupo, porRef)).filter(Boolean)
    }))
    .filter((ficha) => ficha.grupos.length);
  const avisos = (Array.isArray(bruto?.avisos) ? bruto.avisos : []).map(texto).filter(Boolean);
  return { fichas, avisos };
}

module.exports = { montarCatalogoParaPrompt, traduzirProposta, tipoDoGrupo };
