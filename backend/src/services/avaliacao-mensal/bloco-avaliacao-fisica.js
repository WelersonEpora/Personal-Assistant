"use strict";

// docs/adr/0025-avaliacao-fisica-no-acompanhamento-mensal.md: bloco do prompt
// do Acompanhamento Mensal com as medidas da(s) avaliação(ões) física(s) do
// mês. "O código calcula, a IA interpreta": valores, diferenças e intervalo em
// dias saem prontos daqui; a IA não faz conta nenhuma. Puro (sem banco) -
// recebe as avaliações já carregadas (objetos planos, com `medidas[].metrica`).

const { ROTULOS_METODO } = require("../avaliacao-fisica/metodos");

// Métricas que vão para a IA (ADR-0025 §3), na ordem do bloco. Só a medida
// `principal` de cada uma. PA de repouso sai combinada numa linha só.
const METRICAS_ACOMPANHAMENTO = [
  "peso",
  "percentual_gordura",
  "massa_magra",
  "massa_gorda",
  "massa_muscular_esqueletica",
  "imc",
  "rcq",
  "rcest",
  "perimetro_cintura",
  "perimetro_abdome",
  "perimetro_quadril",
  "perimetro_braco_d",
  "perimetro_coxa_d",
  "fc_repouso"
];

// Massa gorda/magra são derivadas da % de gordura (metricas-derivadas.js) e
// gravadas com metodo "direto": para comparabilidade, herdam o método da %.
const HERDAM_METODO_DA_GORDURA = new Set(["massa_gorda", "massa_magra"]);

const MENOS = "−"; // sinal de menos tipográfico

function principal(avaliacao, codigo) {
  const medida = (avaliacao?.medidas || []).find((m) => m.metrica_codigo === codigo && m.principal);
  if (!medida) return null;
  const valor = Number(medida.valor);
  return Number.isFinite(valor) ? { ...medida, valor } : null;
}

function metodoComparavel(avaliacao, codigo) {
  if (HERDAM_METODO_DA_GORDURA.has(codigo)) {
    const gordura = principal(avaliacao, "percentual_gordura");
    if (gordura) return gordura.metodo;
  }
  return principal(avaliacao, codigo)?.metodo || null;
}

function formatarNumero(valor, casas) {
  return valor.toFixed(casas).replace(".", ",");
}

function unidadeExibida(metrica) {
  const unidade = metrica?.unidade || "";
  return unidade === "adimensional" ? "" : unidade;
}

function comUnidade(texto, unidade) {
  return unidade ? `${texto} ${unidade}` : texto;
}

function formatarDiferenca(delta, casas, unidade, codigo) {
  const arredondado = Number(delta.toFixed(casas));
  if (arredondado === 0) return "sem variação";
  const sinal = arredondado > 0 ? "+" : MENOS;
  const numero = formatarNumero(Math.abs(arredondado), casas);
  // % de gordura varia em pontos percentuais, não em "%".
  return `${sinal}${comUnidade(numero, codigo === "percentual_gordura" ? "p.p." : unidade)}`;
}

// Dias entre duas datas "YYYY-MM-DD" (b - a), sem fuso.
function diasEntre(a, b) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

function dataBr(ymd) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function rotuloMetrica(medida, codigo, avaliacao) {
  const rotulo = medida.metrica?.rotulo || codigo;
  const metodo = metodoComparavel(avaliacao, codigo);
  const mostraMetodo = (codigo === "percentual_gordura" || HERDAM_METODO_DA_GORDURA.has(codigo)) && metodo && metodo !== "direto";
  return mostraMetodo ? `${rotulo} (${ROTULOS_METODO[metodo] || metodo})` : rotulo;
}

function linhaMetrica(codigo, atual, base) {
  const medida = principal(atual, codigo);
  if (!medida) return null;
  const casas = medida.metrica?.casas_decimais ?? 1;
  const unidade = unidadeExibida(medida.metrica);
  let linha = `  - ${rotuloMetrica(medida, codigo, atual)}: ${comUnidade(formatarNumero(medida.valor, casas), unidade)}`;

  const anterior = base ? principal(base, codigo) : null;
  if (!anterior) return linha;

  const metodoAtual = metodoComparavel(atual, codigo);
  const metodoAnterior = metodoComparavel(base, codigo);
  if (metodoAtual !== metodoAnterior) {
    const rotuloAnterior = ROTULOS_METODO[metodoAnterior] || metodoAnterior;
    linha +=
      ` — método diferente da anterior (${rotuloAnterior}: ` +
      `${comUnidade(formatarNumero(anterior.valor, casas), unidade)}), não comparar`;
    return linha;
  }
  return `${linha} (${formatarDiferenca(medida.valor - anterior.valor, casas, unidade, codigo)})`;
}

function linhaPressao(atual, base) {
  const pas = principal(atual, "pas_repouso");
  const pad = principal(atual, "pad_repouso");
  if (!pas || !pad) return null;
  let linha = `  - PA de repouso: ${pas.valor.toFixed(0)}/${pad.valor.toFixed(0)} mmHg`;
  const pasAnt = base ? principal(base, "pas_repouso") : null;
  const padAnt = base ? principal(base, "pad_repouso") : null;
  if (pasAnt && padAnt) linha += ` (anterior: ${pasAnt.valor.toFixed(0)}/${padAnt.valor.toFixed(0)})`;
  return linha;
}

function secaoAvaliacao(atual, base) {
  const cabecalho = base
    ? `[avaliacao_fisica:${atual.id} | em ${atual.data} | anterior: ${base.data}, ${diasEntre(base.data, atual.data)} dias antes]`
    : `[avaliacao_fisica:${atual.id} | em ${atual.data} | primeira avaliação registrada]`;
  const linhas = METRICAS_ACOMPANHAMENTO.map((codigo) => linhaMetrica(codigo, atual, base));
  linhas.push(linhaPressao(atual, base));
  const presentes = linhas.filter(Boolean);
  return [cabecalho, ...(presentes.length ? presentes : ["  - (nenhuma das medidas acompanhadas foi registrada)"])].join("\n");
}

// `doMes`: avaliações com `data` no mês de referência; `anterior`: a última
// com `data` antes do mês (base de comparação, nunca comentada); `fimData`:
// último dia do mês ("YYYY-MM-DD"), referência do "há N dias".
function montarBlocoAvaliacaoFisica({ doMes = [], anterior = null, fimData }) {
  const titulo = "=== AVALIAÇÃO FÍSICA DO MÊS (medidas objetivas registradas pelo personal) ===";

  if (!doMes.length) {
    const linha = anterior
      ? `Nenhuma avaliação física neste mês. Última: ${dataBr(anterior.data)} (há ${diasEntre(anterior.data, fimData)} dias no fim do mês).`
      : "Nenhuma avaliação física registrada para este aluno.";
    return `\n\n${titulo}\n${linha}`;
  }

  const ordenadas = [...doMes].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const secoes = ordenadas.map((atual, i) => secaoAvaliacao(atual, i === 0 ? anterior : ordenadas[i - 1]));
  return `\n\n${titulo}\n${secoes.join("\n\n")}`;
}

module.exports = { METRICAS_ACOMPANHAMENTO, montarBlocoAvaliacaoFisica };
