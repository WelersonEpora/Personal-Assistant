// docs/adr/0031 - referências de leitura das medidas da avaliação física
// ("como um exame de sangue"). Calculado na hora, nunca gravado: é leitura do
// valor, não dado novo. Tabelas fixas no código, cada uma com a fonte - quem
// muda uma faixa muda aqui, com teste. Linguagem de referência, nunca de
// diagnóstico.

import { calcularIdade } from './avaliacaoFisica.js'

// Faixas: lista ordenada; `max` é o limite superior EXCLUSIVO da faixa (valor
// < max), ou inclusivo com `fechado: true` (valor <= max). A última tem
// max = Infinity. `tom` segue as classes de badge (success/warning/danger/info).
const IMC_OMS = [
  { max: 18.5, rotulo: 'Baixo peso', tom: 'warning' },
  { max: 25, rotulo: 'Normal', tom: 'success' },
  { max: 30, rotulo: 'Sobrepeso', tom: 'warning' },
  { max: 35, rotulo: 'Obesidade I', tom: 'danger' },
  { max: 40, rotulo: 'Obesidade II', tom: 'danger' },
  { max: Infinity, rotulo: 'Obesidade III', tom: 'danger' }
]

// Pessoa idosa (60+): Lipschitz (1994), adotado pelo SISVAN/Ministério da Saúde.
const IMC_IDOSO = [
  { max: 22, fechado: true, rotulo: 'Baixo peso', tom: 'warning' },
  { max: 27, rotulo: 'Adequado', tom: 'success' },
  { max: Infinity, rotulo: 'Sobrepeso', tom: 'warning' }
]

// Gallagher et al. (2000), Am J Clin Nutr 72:694 - faixas de % de gordura
// equivalentes às do IMC, por sexo e idade (as mesmas das balanças de
// bioimpedância). Cortes: [baixa→adequada, adequada→elevada, elevada→muito].
const GORDURA_CORTES = {
  M: [
    { ate: 39, cortes: [8, 20, 25] },
    { ate: 59, cortes: [11, 22, 28] },
    { ate: Infinity, cortes: [13, 25, 30] }
  ],
  F: [
    { ate: 39, cortes: [21, 33, 39] },
    { ate: 59, cortes: [23, 34, 40] },
    { ate: Infinity, cortes: [24, 36, 42] }
  ]
}

function faixasGordura(sexo, idade) {
  const [a, b, c] = GORDURA_CORTES[sexo].find((g) => idade <= g.ate).cortes
  return [
    { max: a, rotulo: 'Baixa', tom: 'warning' },
    { max: b, rotulo: 'Adequada', tom: 'success' },
    { max: c, rotulo: 'Elevada', tom: 'warning' },
    { max: Infinity, rotulo: 'Muito elevada', tom: 'danger' }
  ]
}

// OMS (2008) - circunferência da cintura e risco cardiometabólico.
const CINTURA_CORTES = { M: [94, 102], F: [80, 88] }
const RCQ_CORTE = { M: 0.9, F: 0.85 }

// Diretriz Brasileira de Hipertensão Arterial (SBC, 2020). Os rótulos da
// tela evitam o nome diagnóstico ("hipertensão estágio 1") - a diretriz é
// citada na explicação. Mesma posição nas duas listas = mesma categoria.
const PA_CATEGORIAS = [
  { rotulo: 'Ótima', diretriz: 'ótima', tom: 'success' },
  { rotulo: 'Normal', diretriz: 'normal', tom: 'success' },
  { rotulo: 'Limítrofe', diretriz: 'pré-hipertensão', tom: 'warning' },
  { rotulo: 'Elevada · faixa 1', diretriz: 'estágio 1', tom: 'danger' },
  { rotulo: 'Elevada · faixa 2', diretriz: 'estágio 2', tom: 'danger' },
  { rotulo: 'Elevada · faixa 3', diretriz: 'estágio 3', tom: 'danger' }
]
const PA_CORTES = {
  pas_repouso: [120, 130, 140, 160, 180],
  pad_repouso: [80, 85, 90, 100, 110]
}

function faixasPressao(codigo) {
  const cortes = PA_CORTES[codigo]
  return PA_CATEGORIAS.map((cat, i) => ({ max: cortes[i] ?? Infinity, rotulo: cat.rotulo, tom: cat.tom }))
}

function indiceFaixa(faixas, valor) {
  return faixas.findIndex((f) => (f.fechado ? valor <= f.max : valor < f.max))
}

// Cada referência: escala (régua na tela) + montagem das faixas a partir do
// contexto. `exige`: o que precisa vir do cadastro do aluno.
const REFERENCIAS = {
  imc: {
    exige: [],
    idadeMinima: 18,
    escala: (ctx) => (ctx.idade >= 60 ? { min: 16, max: 34 } : { min: 15, max: 45 }),
    faixas: (ctx) => (ctx.idade >= 60 ? IMC_IDOSO : IMC_OMS),
    fonte: (ctx) => (ctx.idade >= 60 ? 'Lipschitz (1994), adotado pelo SISVAN/Ministério da Saúde para 60+' : 'OMS'),
    nota: 'O IMC não separa músculo de gordura — em alunos treinados, leia junto com a % de gordura.'
  },
  percentual_gordura: {
    exige: ['sexo', 'data_nascimento'],
    idadeMinima: 18,
    escala: (ctx) => (ctx.sexo === 'M' ? { min: 0, max: 40 } : { min: 10, max: 50 }),
    faixas: (ctx) => faixasGordura(ctx.sexo, ctx.idade),
    fonte: () => 'Gallagher et al. (2000), Am J Clin Nutr — por sexo e idade',
    nota: 'Faixas de saúde, não de estética: atletas costumam ficar perto do limite inferior da faixa adequada.'
  },
  perimetro_cintura: {
    exige: ['sexo'],
    idadeMinima: 18,
    escala: (ctx) => (ctx.sexo === 'M' ? { min: 70, max: 120 } : { min: 60, max: 110 }),
    faixas: (ctx) => {
      const [a, b] = CINTURA_CORTES[ctx.sexo]
      return [
        { max: a, rotulo: 'Adequada', tom: 'success' },
        { max: b, rotulo: 'Risco aumentado', tom: 'warning' },
        { max: Infinity, rotulo: 'Risco muito aumentado', tom: 'danger' }
      ]
    },
    fonte: () => 'OMS (2008) — risco cardiometabólico',
    nota: 'O corte vale para a cintura (ponto médio entre a última costela e a crista ilíaca), não para o perímetro do abdome.'
  },
  rcq: {
    exige: ['sexo'],
    idadeMinima: 18,
    escala: () => ({ min: 0.7, max: 1.1 }),
    faixas: (ctx) => [
      { max: RCQ_CORTE[ctx.sexo], rotulo: 'Adequada', tom: 'success' },
      { max: Infinity, rotulo: 'Risco aumentado', tom: 'warning' }
    ],
    fonte: () => 'OMS (2008)'
  },
  rcest: {
    exige: [],
    idadeMinima: 0,
    escala: () => ({ min: 0.35, max: 0.75 }),
    faixas: () => [
      { max: 0.5, rotulo: 'Adequada', tom: 'success' },
      { max: 0.6, rotulo: 'Risco aumentado', tom: 'warning' },
      { max: Infinity, rotulo: 'Risco muito aumentado', tom: 'danger' }
    ],
    fonte: () => 'Ashwell & Hsieh (2005) — "cintura menor que metade da altura"'
  },
  pas_repouso: {
    exige: [],
    idadeMinima: 18,
    escala: () => ({ min: 90, max: 200 }),
    faixas: () => faixasPressao('pas_repouso'),
    fonte: () => 'Diretriz Brasileira de Hipertensão Arterial (SBC, 2020)',
    nota: 'Uma medida isolada não confirma nada — a classificação é para orientar, não para diagnosticar.'
  },
  pad_repouso: {
    exige: [],
    idadeMinima: 18,
    escala: () => ({ min: 50, max: 120 }),
    faixas: () => faixasPressao('pad_repouso'),
    fonte: () => 'Diretriz Brasileira de Hipertensão Arterial (SBC, 2020)',
    nota: 'Uma medida isolada não confirma nada — a classificação é para orientar, não para diagnosticar.'
  },
  fc_repouso: {
    exige: [],
    idadeMinima: 18,
    escala: () => ({ min: 40, max: 120 }),
    faixas: () => [
      { max: 60, rotulo: 'Baixa', tom: 'info' },
      { max: 101, rotulo: 'Normal', tom: 'success' },
      { max: Infinity, rotulo: 'Elevada', tom: 'danger' }
    ],
    fonte: () => 'American Heart Association — adulto em repouso',
    nota: 'Abaixo de 60 bpm é comum em quem treina aeróbio; com tontura ou desmaio, orientar avaliação médica.'
  }
}

export const METRICAS_COM_REFERENCIA = Object.keys(REFERENCIAS)

export function temReferencia(codigo) {
  return codigo in REFERENCIAS
}

// Contexto do aluno na data da avaliação: { sexo, idade, valores }. `valores`
// ({ codigo: número }) é usado só para cruzar sistólica e diastólica.
export function contextoDoAluno(aluno, dataAvaliacao, valores = {}) {
  return {
    sexo: aluno?.sexo === 'M' || aluno?.sexo === 'F' ? aluno.sexo : null,
    idade: calcularIdade(aluno?.data_nascimento, dataAvaliacao),
    valores
  }
}

const ROTULO_EXIGE = { sexo: 'sexo', data_nascimento: 'data de nascimento' }

// null = métrica sem referência (só explicação). { semReferencia, motivo } =
// tem tabela, mas falta dado do cadastro ou não se aplica à idade. Senão, a
// classificação completa para a etiqueta, a régua e o texto da fonte.
export function classificar(codigo, valor, ctx = {}) {
  const ref = REFERENCIAS[codigo]
  if (!ref) return null
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return null

  const faltando = ref.exige.filter((c) => (c === 'sexo' ? !ctx.sexo : ctx.idade == null))
  if (faltando.length) {
    return {
      semReferencia: true,
      motivo: `Sem referência: falta ${faltando.map((c) => ROTULO_EXIGE[c]).join(' e ')} no cadastro do aluno.`
    }
  }
  if (ctx.idade != null && ctx.idade < ref.idadeMinima) {
    return { semReferencia: true, motivo: `Sem referência: a tabela usada vale a partir de ${ref.idadeMinima} anos.` }
  }

  const faixas = ref.faixas(ctx)
  const i = indiceFaixa(faixas, n)
  const resultado = {
    rotulo: faixas[i].rotulo,
    tom: faixas[i].tom,
    faixas,
    indice: i,
    escala: ref.escala(ctx),
    fonte: ref.fonte(ctx),
    nota: ref.nota || null,
    alerta: null,
    combinada: null
  }

  if (codigo in PA_CORTES) Object.assign(resultado, leituraPressao(codigo, i, ctx.valores))
  if (codigo === 'fc_repouso' && i === 2) resultado.alerta = 'Acima da referência em repouso: considerar encaminhamento médico.'

  return resultado
}

// A diretriz classifica a pressão pela MAIOR categoria entre sistólica e
// diastólica - cada linha mostra a sua, e a combinada vem junto.
function leituraPressao(codigo, i, valores = {}) {
  const outro = codigo === 'pas_repouso' ? 'pad_repouso' : 'pas_repouso'
  const vOutro = Number(valores[outro])
  let iFinal = i
  let combinada = null
  if (Number.isFinite(vOutro) && vOutro > 0) {
    iFinal = Math.max(i, indiceFaixa(faixasPressao(outro), vOutro))
    const { rotulo, diretriz, tom } = PA_CATEGORIAS[iFinal]
    combinada = { rotulo, diretriz, tom }
  }
  let alerta = null
  if (iFinal >= 5) alerta = 'Valor muito alto em repouso: orientar avaliação médica antes de seguir com treino intenso.'
  else if (iFinal >= 3) alerta = 'Acima da referência: considerar encaminhamento médico.'
  return { combinada, alerta }
}

function formatar(n, casas) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// Faixas em texto, estilo laudo: "< 18,5", "18,5 – 24,9", "≥ 40".
export function descreverFaixas(faixas, casas = 1) {
  const passo = 10 ** -casas
  let anterior = null // { valor, fechado }
  return faixas.map((f) => {
    let ini = null
    if (anterior) ini = anterior.fechado ? anterior.valor + passo : anterior.valor
    let fim = null
    if (f.max !== Infinity) fim = f.fechado ? f.max : f.max - passo
    let intervalo
    if (ini == null) intervalo = `${f.fechado ? '≤' : '<'} ${formatar(f.max, casas)}`
    else if (fim == null) intervalo = `≥ ${formatar(ini, casas)}`
    else intervalo = `${formatar(ini, casas)} – ${formatar(fim, casas)}`
    anterior = { valor: f.max, fechado: !!f.fechado }
    return { intervalo, rotulo: f.rotulo, tom: f.tom }
  })
}

// Resumo de uma linha para o title (tooltip do desktop).
export function resumoReferencia(classificacao, casas = 1) {
  if (!classificacao) return ''
  if (classificacao.semReferencia) return classificacao.motivo
  const faixa = descreverFaixas(classificacao.faixas, casas)[classificacao.indice]
  return `${classificacao.rotulo}: ${faixa.intervalo} · ${classificacao.fonte.split(' — ')[0]}`
}

// Posição (0–100) de um valor na régua, limitada à escala.
export function posicaoNaEscala(valor, escala) {
  const p = ((Number(valor) - escala.min) / (escala.max - escala.min)) * 100
  return Math.min(100, Math.max(0, p))
}

// Segmentos da régua (início/fim em % da largura) e os cortes visíveis.
export function segmentosRegua(faixas, escala) {
  let inicio = escala.min
  const segmentos = []
  for (const f of faixas) {
    const fim = Math.min(f.max, escala.max)
    if (fim > inicio) {
      segmentos.push({
        rotulo: f.rotulo,
        tom: f.tom,
        de: posicaoNaEscala(inicio, escala),
        ate: posicaoNaEscala(fim, escala),
        corte: f.max < escala.max ? f.max : null
      })
    }
    inicio = Math.max(inicio, f.max)
    if (inicio >= escala.max) break
  }
  return segmentos
}

// Variação para a avaliação anterior, lida pela direção favorável do catálogo
// ('menor' | 'maior' | 'neutro').
export function variacao(atual, anterior, direcao = 'neutro') {
  if (atual == null || anterior == null || atual === '' || anterior === '') return null
  const a = Number(atual)
  const b = Number(anterior)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const delta = a - b
  let leitura = 'neutra'
  if (delta !== 0 && direcao === 'menor') leitura = delta < 0 ? 'favoravel' : 'desfavoravel'
  if (delta !== 0 && direcao === 'maior') leitura = delta > 0 ? 'favoravel' : 'desfavoravel'
  return { delta, leitura }
}

export const TEXTO_DIRECAO = {
  menor: 'Menor é melhor.',
  maior: 'Maior é melhor.',
  neutro: null
}

// "O que é" de cada métrica - curto, para o personal não precisar buscar.
const EXPLICACOES = {
  peso: 'Massa corporal total. Sozinho não diz se mudou gordura ou músculo — leia junto com a composição corporal.',
  altura: 'Estatura em pé. Usada no IMC e na relação cintura-estatura.',
  percentual_gordura: 'Quanto do peso corporal é gordura. É o principal indicador de composição corporal; compare sempre pelo mesmo método.',
  massa_gorda: 'Peso da gordura, em kg (peso × % de gordura). Calculada pelo sistema.',
  massa_magra: 'Tudo que não é gordura: músculo, ossos, órgãos e água (peso − massa gorda). Calculada pelo sistema; subir costuma indicar ganho muscular.',
  massa_muscular_esqueletica: 'Músculo ligado ao esqueleto, estimado pela bioimpedância. Compare sempre no mesmo aparelho.',
  agua_corporal_total: 'Água total do corpo, estimada pela bioimpedância. Varia com hidratação, refeição e treino recente.',
  massa_ossea: 'Massa mineral óssea estimada pela bioimpedância. Muda pouco; não substitui densitometria.',
  taxa_metabolica_basal: 'Energia gasta em repouso absoluto em um dia, estimada por equação ou bioimpedância. Acompanha a massa magra.',
  perimetro_pescoco: 'Circunferência do pescoço. Associada a risco cardiometabólico e apneia do sono.',
  perimetro_ombro: 'Circunferência na altura dos ombros. Acompanha o desenvolvimento da cintura escapular.',
  perimetro_torax: 'Circunferência do tórax. Acompanha o desenvolvimento do peitoral e das costas.',
  perimetro_cintura: 'Circunferência no ponto médio entre a última costela e a crista ilíaca. Indica gordura abdominal, a mais ligada a risco cardiometabólico.',
  perimetro_abdome: 'Circunferência na altura do umbigo. Acompanha a gordura abdominal, mas não usa o mesmo corte de risco da cintura.',
  perimetro_quadril: 'Circunferência na maior protuberância dos glúteos. Usada na relação cintura-quadril.',
  imc: 'Peso dividido pela altura ao quadrado (kg/m²). Triagem rápida de peso em relação à altura.',
  rcq: 'Cintura ÷ quadril. Indica onde a gordura se concentra: quanto maior, mais gordura abdominal.',
  rcest: 'Cintura ÷ altura. Indicador simples de gordura abdominal: a cintura deve ser menor que metade da altura.',
  vo2max: 'Consumo máximo de oxigênio: a capacidade aeróbia. Compare sempre pelo mesmo teste ou protocolo.',
  fc_repouso: 'Batimentos por minuto em repouso, de preferência medidos sentado e calmo. Costuma cair com o condicionamento aeróbio.',
  fc_maxima: 'Maior frequência cardíaca atingida (medida em teste) ou estimada pela idade. Base para as zonas de treino.',
  pas_repouso: 'Pressão sistólica (a "máxima"): pressão nas artérias quando o coração contrai.',
  pad_repouso: 'Pressão diastólica (a "mínima"): pressão nas artérias com o coração relaxado.',
  densidade_corporal: 'Densidade do corpo estimada pelas dobras; é a base do cálculo da % de gordura. Não tem faixa própria — leia pela % de gordura.'
}

const EXPLICACAO_CATEGORIA = {
  perimetro: 'Circunferência do segmento, medida com fita. Sobe com ganho muscular e com gordura — leia junto com as dobras e a % de gordura.',
  dobra: 'Espessura da dobra de pele e gordura subcutânea no local, medida com plicômetro. Não tem faixa própria: compare com a avaliação anterior.'
}

export function explicacao(codigo, categoria) {
  if (EXPLICACOES[codigo]) return EXPLICACOES[codigo]
  if (codigo.startsWith('perimetro_braco')) return 'Circunferência do braço relaxado, no ponto médio. Acompanha o desenvolvimento muscular — leia junto com a dobra tricipital.'
  if (codigo.startsWith('perimetro_coxa')) return 'Circunferência da coxa. Acompanha o desenvolvimento muscular dos membros inferiores — leia junto com a dobra da coxa.'
  return EXPLICACAO_CATEGORIA[categoria] || null
}
