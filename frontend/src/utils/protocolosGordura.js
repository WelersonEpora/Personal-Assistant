// docs/adr/0024 - espelho, SÓ para o preview do formulário, do cálculo do
// backend (backend/src/services/avaliacao-fisica/protocolos-gordura.js). Quem
// grava é sempre o backend - manter as duas fórmulas em sincronia.
//
// Pollock 7 dobras: densidade de Jackson & Pollock (homens) / Jackson,
// Pollock & Ward (mulheres) + conversão em % pelas constantes de Lohman por
// idade/sexo (conferido contra o BodyMove).

export const PROTOCOLOS_CALCULADOS = ['pollock_7']

export const DOBRAS_POR_PROTOCOLO = {
  pollock_7: [
    'dobra_peitoral',
    'dobra_axilar_media',
    'dobra_tricipital',
    'dobra_subescapular',
    'dobra_abdominal',
    'dobra_suprailiaca',
    'dobra_coxa'
  ]
}

export const IDADE_MINIMA = 17

function densidadePollock7(soma, sexo, idade) {
  if (sexo === 'M') return 1.112 - 0.00043499 * soma + 0.00000055 * soma * soma - 0.00028826 * idade
  return 1.097 - 0.00046971 * soma + 0.00000056 * soma * soma - 0.00012828 * idade
}

function constantesConversao(sexo, idade) {
  if (sexo === 'M') return idade < 20 ? [4.98, 4.53] : [4.95, 4.5]
  return idade < 20 ? [5.05, 4.62] : [5.03, 4.59]
}

export function ehProtocoloCalculado(metodo) {
  return PROTOCOLOS_CALCULADOS.includes(metodo)
}

// `dobras`: { metrica_codigo: valor }. Retorna { densidade, percentual } ou
// { faltando: [...] } - códigos de dobra e/ou 'sexo', 'data_nascimento',
// 'idade_minima' (mesmo contrato do backend).
export function calcularPercentualGordura(protocolo, { dobras = {}, sexo = null, idade = null } = {}) {
  const lista = DOBRAS_POR_PROTOCOLO[protocolo]
  if (!lista) return { faltando: ['protocolo'] }
  const faltando = []
  if (sexo !== 'F' && sexo !== 'M') faltando.push('sexo')
  if (idade === null || idade === undefined) faltando.push('data_nascimento')
  else if (idade < IDADE_MINIMA) faltando.push('idade_minima')
  for (const codigo of lista) {
    const v = Number(dobras[codigo])
    if (!(Number.isFinite(v) && v > 0)) faltando.push(codigo)
  }
  if (faltando.length) return { faltando }

  const soma = lista.reduce((t, c) => t + Number(dobras[c]), 0)
  const densidade = densidadePollock7(soma, sexo, idade)
  const [a, b] = constantesConversao(sexo, idade)
  const percentual = (a / densidade - b) * 100
  if (!(densidade > 0 && percentual > 0)) return { faltando: ['valores_invalidos'] }
  return { densidade, percentual }
}

// `faltando` -> frases curtas para o aviso do formulário. `rotuloMetrica`
// resolve o rótulo de uma dobra pelo catálogo.
export function descreverFaltando(faltando, rotuloMetrica = (c) => c) {
  const cadastro = []
  const dobras = []
  const outros = []
  for (const item of faltando) {
    if (item === 'sexo') cadastro.push('sexo')
    else if (item === 'data_nascimento') cadastro.push('data de nascimento')
    else if (item === 'idade_minima') outros.push(`o protocolo é para maiores de ${IDADE_MINIMA} anos`)
    else if (item === 'valores_invalidos') outros.push('confira os valores das dobras')
    else dobras.push(rotuloMetrica(item))
  }
  const frases = []
  if (cadastro.length) frases.push(`no cadastro do aluno: ${cadastro.join(' e ')}`)
  if (dobras.length) frases.push(`dobras: ${dobras.join(', ')}`)
  return [...frases, ...outros]
}
