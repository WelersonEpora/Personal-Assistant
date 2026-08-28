"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §4):
// `metodo` (protocolo/fórmula/teste que produziu o valor) é constante de
// código - vira tabela só se ganhar metadados de exibição, hoje não tem
// (mesmo padrão de `Exercicio.DIFICULDADES`). Usado pelo model
// `AvaliacaoFisicaMedida` (validação `isIn`), pelo importador do legado e,
// futuramente, pelo controller de CRUD.

// 'direto' = medição sem protocolo (peso, altura, perímetro, dobra bruta,
// PA, FC). Os demais identificam valores derivados/estimados.
const METODOS_COMPOSICAO = [
  "direto",
  "pollock_7",
  "durnin_womersley",
  "petroski",
  "deurenberg",
  "faulkner",
  "guedes",
  "slaughter",
  "bioimpedancia",
  "dexa",
  "informado"
];

const METODOS_VO2 = [
  "cooper_12min",
  "corrida_1600m",
  "corrida_2400m",
  "balke_15min",
  "ellestad_esteira",
  "astrand_ciclo",
  "ergoespirometria"
];

const METODOS_VALIDOS = [...METODOS_COMPOSICAO, ...METODOS_VO2];

const ROTULOS_METODO = {
  direto: "Medição direta",
  pollock_7: "Pollock 7 dobras",
  durnin_womersley: "Durnin & Womersley 4 dobras",
  petroski: "Petroski 4 dobras",
  deurenberg: "Deurenberg 4 dobras",
  faulkner: "Faulkner 4 dobras",
  guedes: "Guedes",
  slaughter: "Slaughter 2 dobras",
  bioimpedancia: "Bioimpedância",
  dexa: "DEXA",
  informado: "Informado pelo aluno/exame",
  cooper_12min: "Teste de Cooper (12 min)",
  corrida_1600m: "Corrida/caminhada 1600 m",
  corrida_2400m: "Corrida 2400 m",
  balke_15min: "Balke (15 min)",
  ellestad_esteira: "Esteira submáximo (Ellestad)",
  astrand_ciclo: "Cicloergômetro (Åstrand)",
  ergoespirometria: "Ergoespirometria"
};

// Mapa usado só pelo importador do BodyMove (proposta v3 §8): tabela-filha do
// legado -> `metodo` da medida gerada.
const METODO_POR_TABELA_LEGADO = {
  pollock_7dobras: "pollock_7",
  durninwormersley_4dobras: "durnin_womersley",
  petroski_4dobras: "petroski",
  deurenberg_4dobras: "deurenberg",
  faulkner_4dobras: "faulkner",
  slaughter_2dobras: "slaughter",
  composicao_direta: "informado",
  cardio_cooper12minutos: "cooper_12min",
  cardio_1600metros: "corrida_1600m",
  cardio_2400metros: "corrida_2400m",
  cardio_balke15minutos: "balke_15min",
  cardio_subesteiellstad: "ellestad_esteira"
};

// Qual método de % de gordura vira `principal` quando a avaliação tem vários
// (proposta v3 §4): o primeiro presente nesta ordem. `pollock_7` casa com
// `antropometria.padrao = 'pollock'` em 100% dos 405 registros do legado.
const PRECEDENCIA_PRINCIPAL_GORDURA = [
  "pollock_7",
  "durnin_womersley",
  "petroski",
  "deurenberg",
  "faulkner",
  "slaughter",
  "informado",
  "bioimpedancia",
  "dexa"
];

module.exports = {
  METODOS_VALIDOS,
  METODOS_COMPOSICAO,
  METODOS_VO2,
  ROTULOS_METODO,
  METODO_POR_TABELA_LEGADO,
  PRECEDENCIA_PRINCIPAL_GORDURA
};
