// docs/adr/0022 - rótulos e helpers puros do Radar. Sem lógica de rede.

// Tipo de documento -> rótulo curto + sufixo da classe do badge
// (assets/tokens.css: badge-primary/info/neutral) + família, que agrupa os
// tipos por categoria (não por qualidade - a ADR proíbe selo metodológico):
//   entidade = documento de um órgão/entidade (diretriz, position stand, consenso)
//   sintese  = síntese de evidência (revisão sistemática, meta-análise)
//   estudo   = estudo individual / outro
// `descricao` é a frase que a legenda "Como ler os selos" mostra na tela.
export const TIPO_META = {
  diretriz: {
    rotulo: 'Diretriz',
    badge: 'primary',
    familia: 'entidade',
    descricao: 'Recomendações práticas oficiais de um órgão (OMS, Ministério da Saúde, ACSM) sobre como agir.'
  },
  position_stand: {
    rotulo: 'Position stand',
    badge: 'primary',
    familia: 'entidade',
    descricao: 'Posicionamento formal de uma entidade científica sobre um tema, com base na literatura.'
  },
  consenso: {
    rotulo: 'Consenso',
    badge: 'primary',
    familia: 'entidade',
    descricao: 'Acordo de um painel de especialistas sobre um tema em que a evidência ainda não é definitiva.'
  },
  revisao_sistematica: {
    rotulo: 'Revisão sistemática',
    badge: 'info',
    familia: 'sintese',
    descricao: 'Reúne, de forma estruturada e reprodutível, todos os estudos publicados sobre uma pergunta.'
  },
  meta_analise: {
    rotulo: 'Meta-análise',
    badge: 'info',
    familia: 'sintese',
    descricao: 'Revisão sistemática que ainda combina os resultados dos estudos num efeito único. Alto nível de evidência.'
  },
  estudo_primario: {
    rotulo: 'Estudo primário',
    badge: 'neutral',
    familia: 'estudo',
    descricao: 'Uma pesquisa original (ensaio, coorte, experimento). Confira o desenho antes de generalizar.'
  },
  outro: {
    rotulo: 'Publicação',
    badge: 'neutral',
    familia: 'estudo',
    descricao: 'Rótulo genérico quando não se encaixa nos demais ou não deu para classificar com segurança (editorial, carta, norma do CONFEF/CREF).'
  }
}

export function tipoMeta(tipo) {
  return TIPO_META[tipo] || TIPO_META.outro
}

// Legenda "Como ler os selos" - as 3 famílias na ordem em que aparecem na
// tela, cada uma com os tipos que a compõem (derivado de TIPO_META, para não
// duplicar rótulo/descrição). A cor agrupa por CATEGORIA de documento, não
// por confiabilidade (docs/adr/0022).
export const FAMILIAS_TIPO = [
  { chave: 'entidade', rotulo: 'Documento de uma entidade', descricao: 'Recomendação institucional de um órgão reconhecido.' },
  { chave: 'sintese', rotulo: 'Síntese de evidência', descricao: 'Reúne e avalia vários estudos de uma vez; não gera dado novo.' },
  { chave: 'estudo', rotulo: 'Estudo ou publicação isolada', descricao: 'Uma peça só do quebra-cabeça.' }
]

export function legendaTipos() {
  return FAMILIAS_TIPO.map((familia) => ({
    ...familia,
    tipos: Object.entries(TIPO_META)
      .filter(([, meta]) => meta.familia === familia.chave)
      .map(([chave, meta]) => ({ chave, ...meta }))
  }))
}

// "informada pela IA" - vem como texto livre; só normaliza espaços.
export function dataInformada(valor) {
  if (!valor || typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo || null
}

// minúsculas + sem acento, para a busca textual da tela casar "analise" com
// "análise". Entrada não-string vira "". A faixa ̀-ͯ são as marcas
// diacríticas combinantes que o normalize('NFD') separa das letras.
export function normalizar(texto) {
  if (typeof texto !== 'string') return ''
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Filtra o feed por um termo livre no título, no resumo e nos assuntos
// (docs/adr/0022 §9) - os assuntos são a categoria fina do item, mais
// específica que os 4 grandes grupos do filtro de cima. Termo vazio devolve
// a lista inteira.
export function filtrarPorBusca(itens, termo) {
  const alvo = normalizar(termo).trim()
  if (!alvo) return itens
  return itens.filter((item) => {
    const assuntos = Array.isArray(item.assuntos) ? item.assuntos.join(' ') : ''
    return normalizar(`${item.titulo || ''} ${item.resumo || ''} ${assuntos}`).includes(alvo)
  })
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// Agrupa o feed por mês de entrada no Radar (`created_at`) - dá ritmo à
// leitura e funciona para qualquer janela do filtro de período. Os itens já
// vêm do mais novo para o mais antigo; a ordem dos grupos segue isso.
export function agruparPorMes(itens) {
  const grupos = []
  const porChave = new Map()
  for (const item of itens) {
    const d = new Date(item.created_at)
    const chave = `${d.getFullYear()}-${d.getMonth()}`
    let grupo = porChave.get(chave)
    if (!grupo) {
      grupo = { chave, rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}`, itens: [] }
      porChave.set(chave, grupo)
      grupos.push(grupo)
    }
    grupo.itens.push(item)
  }
  return grupos
}
