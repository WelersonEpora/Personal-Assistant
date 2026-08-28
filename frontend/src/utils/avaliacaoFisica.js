// docs/adr/0016 - metadados da avaliação física para as telas. As listas de
// campos de anamnese/postural são fixas da v3 (§5) e espelham o validador do
// backend em backend/src/services/avaliacao-fisica/esquemas.js - manter em
// sincronia. Os métodos espelham backend/src/services/avaliacao-fisica/metodos.js.

// "YYYY-MM-DD" -> "DD/MM/AAAA" (sem depender de fuso).
export function formatarDataAvaliacao(iso) {
  if (!iso) return ''
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

const NOMES_MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "YYYY-MM-DD" -> "mmm/AA" (ex.: "jan/24") para o cabeçalho da comparação.
export function rotuloMesAno(iso) {
  if (!iso) return ''
  const [ano, mes] = String(iso).slice(0, 10).split('-')
  return `${NOMES_MES_CURTO[Number(mes) - 1]}/${ano.slice(2)}`
}

// Métricas mostradas por padrão na tabela comparativa (o resto fica atrás do
// toggle "ver todas as métricas").
export const METRICAS_COMPARACAO_HEADLINE = [
  'peso',
  'imc',
  'percentual_gordura',
  'massa_gorda',
  'massa_magra',
  'perimetro_cintura',
  'perimetro_quadril',
  'rcq'
]

// Paleta categórica validada (dataviz: scripts/validate_palette.js, PASS
// contra fundo #ffffff). Ordem fixa - nunca ciclar. O aviso de contraste de
// aqua/amarelo/magenta é coberto pela tabela acima dos gráficos (regra de
// relevo) + legenda.
export const PALETA_SERIES = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948' // red
]

// Cor fixa por métrica no card "Composição corporal".
export const CORES_COMPOSICAO = {
  peso: PALETA_SERIES[0],
  massa_gorda: PALETA_SERIES[1],
  massa_magra: PALETA_SERIES[2]
}

// Faixas de referência do IMC (classificação convencional adulto, OMS) -
// SÓ referência visual de fundo no gráfico, nunca diagnóstico. Cores são
// tints bem leves das hues da paleta (baixa opacidade) para não competir
// com a linha do aluno.
export const FAIXAS_IMC = [
  { min: 0, max: 18.5, rotulo: 'Abaixo do peso', cor: 'rgba(237,161,0,0.09)' },
  { min: 18.5, max: 25, rotulo: 'Peso normal', cor: 'rgba(27,175,122,0.10)' },
  { min: 25, max: 30, rotulo: 'Sobrepeso', cor: 'rgba(237,161,0,0.11)' },
  { min: 30, max: Infinity, rotulo: 'Obesidade', cor: 'rgba(227,73,72,0.10)' }
]

// Janela mínima sempre visível no gráfico de IMC (mesmo que a variação do
// aluno seja pequena) - para ele enxergar a distância até as outras faixas.
// O eixo Y usa a UNIÃO desta janela com o intervalo real dos dados.
export const JANELA_IMC = { min: 15, max: 35 }

export const PERIODOS_COMPARACAO = [
  { chave: 'tudo', rotulo: 'Tudo', anos: null },
  { chave: '5', rotulo: '5 anos', anos: 5 },
  { chave: '2', rotulo: '2 anos', anos: 2 },
  { chave: '1', rotulo: '1 ano', anos: 1 }
]

// Corta a lista de avaliações relativo à data MAIS RECENTE (não a "hoje" -
// avaliações históricas do BodyMove vão até 2026).
export function filtrarPorPeriodo(avaliacoes, chave) {
  const periodo = PERIODOS_COMPARACAO.find((p) => p.chave === chave)
  if (!periodo?.anos || !avaliacoes.length) return avaliacoes
  const maisRecente = avaliacoes
    .map((a) => String(a.data).slice(0, 10))
    .sort()
    .at(-1)
  const corte = new Date(`${maisRecente}T00:00:00`)
  corte.setFullYear(corte.getFullYear() - periodo.anos)
  const corteISO = corte.toISOString().slice(0, 10)
  return avaliacoes.filter((a) => String(a.data).slice(0, 10) >= corteISO)
}

// Idade (anos) numa data de referência (default: hoje).
export function calcularIdade(nascimentoIso, refIso) {
  if (!nascimentoIso) return null
  const nasc = new Date(`${String(nascimentoIso).slice(0, 10)}T00:00:00`)
  const ref = refIso ? new Date(`${String(refIso).slice(0, 10)}T00:00:00`) : new Date()
  if (Number.isNaN(nasc.getTime()) || Number.isNaN(ref.getTime())) return null
  let idade = ref.getFullYear() - nasc.getFullYear()
  const m = ref.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < nasc.getDate())) idade -= 1
  return idade >= 0 && idade < 120 ? idade : null
}

export const ROTULOS_METODO = {
  direto: 'Medição direta',
  pollock_7: 'Pollock 7 dobras',
  durnin_womersley: 'Durnin & Womersley 4 dobras',
  petroski: 'Petroski 4 dobras',
  deurenberg: 'Deurenberg 4 dobras',
  faulkner: 'Faulkner 4 dobras',
  guedes: 'Guedes',
  slaughter: 'Slaughter 2 dobras',
  bioimpedancia: 'Bioimpedância',
  dexa: 'DEXA',
  informado: 'Informado (exame/aluno)',
  cooper_12min: 'Teste de Cooper (12 min)',
  corrida_1600m: 'Corrida/caminhada 1600 m',
  corrida_2400m: 'Corrida 2400 m',
  balke_15min: 'Balke (15 min)',
  ellestad_esteira: 'Esteira submáximo (Ellestad)',
  astrand_ciclo: 'Cicloergômetro (Åstrand)',
  ergoespirometria: 'Ergoespirometria'
}

export function rotuloMetodo(codigo) {
  return ROTULOS_METODO[codigo] || codigo
}

// Métricas que aceitam mais de um método na mesma avaliação (o resto é sempre
// 'direto'). Para elas o formulário mostra o seletor de método e o "principal".
export const METODOS_POR_METRICA = {
  percentual_gordura: [
    'pollock_7',
    'durnin_womersley',
    'petroski',
    'deurenberg',
    'faulkner',
    'guedes',
    'slaughter',
    'bioimpedancia',
    'dexa',
    'informado'
  ],
  vo2max: [
    'cooper_12min',
    'corrida_1600m',
    'corrida_2400m',
    'balke_15min',
    'ellestad_esteira',
    'astrand_ciclo',
    'ergoespirometria'
  ]
}

export function ehMultiMetodo(codigo) {
  return Object.prototype.hasOwnProperty.call(METODOS_POR_METRICA, codigo)
}

export const DERIVADAS = ['imc', 'rcq']

// docs/adr/0018 - payload_json da proposta_avaliacao_fisica -> rascunho no
// formato que o AvaliacaoFisicaForm hidrata (sem anamnese/postural - a
// proposta não os produz). Métricas derivadas são descartadas (o service
// recalcula). Só medidas com valor numérico positivo entram.
export function propostaParaRascunho(payload = {}) {
  const medidas = Array.isArray(payload.medidas) ? payload.medidas : []
  return {
    data: payload.data_ouvida || '',
    observacoes: payload.observacoes || '',
    medidas: medidas
      .filter((m) => m && !DERIVADAS.includes(m.metrica_codigo) && Number(m.valor) > 0)
      .map((m) => ({
        metrica_codigo: m.metrica_codigo,
        metodo: m.metodo || 'direto',
        valor: Number(m.valor),
        principal: Boolean(m.principal)
      }))
  }
}

export const CATEGORIA_ROTULO = {
  antropometria: 'Antropometria',
  composicao: 'Composição corporal',
  perimetro: 'Perímetros',
  dobra: 'Dobras cutâneas',
  indice: 'Índices',
  cardio: 'Cardio / Pressão'
}

export const CATEGORIA_ORDEM = ['antropometria', 'perimetro', 'dobra', 'composicao', 'cardio', 'indice']

// --- anamnese (§5.1) --------------------------------------------------
export const HISTORICO_FAMILIAR_OPCOES = ['cardiopatia', 'hipertensao', 'diabetes', 'dislipidemia', 'obesidade']

export const ANAMNESE_CAMPOS_TEXTO = [
  { chave: 'objetivo', rotulo: 'Objetivo', tipo: 'textarea' },
  { chave: 'atividade_tipo', rotulo: 'Tipo de atividade', tipo: 'texto' },
  { chave: 'restricoes', rotulo: 'Restrições', tipo: 'textarea' },
  { chave: 'medicamentos', rotulo: 'Medicamentos', tipo: 'textarea' },
  { chave: 'dores_queixas', rotulo: 'Dores / queixas', tipo: 'textarea' },
  { chave: 'cirurgias_lesoes', rotulo: 'Cirurgias / lesões', tipo: 'textarea' },
  { chave: 'consumo_alcool', rotulo: 'Consumo de álcool', tipo: 'texto' },
  { chave: 'dieta_orientacao', rotulo: 'Dieta / orientação nutricional', tipo: 'texto' },
  { chave: 'alergias', rotulo: 'Alergias', tipo: 'texto' },
  { chave: 'observacoes', rotulo: 'Observações', tipo: 'textarea' }
]

// --- postural (§5.2) -------------------------------------------------
export const POSTURAL_SECOES = [
  {
    regiao: 'coluna',
    rotulo: 'Coluna',
    achados: [
      ['hiperlordose_cervical', 'Hiperlordose cervical'],
      ['hipercifose', 'Hipercifose'],
      ['hiperlordose_lombar', 'Hiperlordose lombar'],
      ['escoliose', 'Escoliose']
    ]
  },
  {
    regiao: 'ombros_escapulas',
    rotulo: 'Ombros / escápulas',
    achados: [
      ['rotacao_interna', 'Rotação interna'],
      ['protracao_escapular', 'Protração escapular'],
      ['retracao_escapular', 'Retração escapular'],
      ['depressao_escapular', 'Depressão escapular'],
      ['ombros_assimetricos', 'Ombros assimétricos'],
      ['encurtamento_trapezio', 'Encurtamento do trapézio']
    ]
  },
  {
    regiao: 'tronco',
    rotulo: 'Tronco',
    achados: [
      ['protrusao_abdominal', 'Protrusão abdominal'],
      ['triangulo_tales_assimetrico', 'Triângulo de Tales assimétrico']
    ]
  },
  {
    regiao: 'quadril',
    rotulo: 'Quadril',
    achados: [
      ['desvio_lateral', 'Desvio lateral'],
      ['assimetria', 'Assimetria']
    ]
  }
]

export const POSTURAL_SECOES_LADO = [
  {
    regiao: 'joelho',
    rotulo: 'Joelho',
    achados: [
      ['flexo', 'Flexo'],
      ['recurvato', 'Recurvato'],
      ['valgo', 'Valgo'],
      ['varo', 'Varo']
    ]
  },
  {
    regiao: 'pe',
    rotulo: 'Pé',
    achados: [
      ['plano', 'Plano'],
      ['cavo', 'Cavo'],
      ['valgo', 'Valgo'],
      ['varo', 'Varo'],
      ['calcaneo', 'Calcâneo'],
      ['equino', 'Equino']
    ]
  }
]

export const LADOS = [
  ['direito', 'Direito'],
  ['esquerdo', 'Esquerdo']
]
