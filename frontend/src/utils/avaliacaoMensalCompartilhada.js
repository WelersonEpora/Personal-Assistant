// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md
//
// Monta a versão da avaliação mensal (ADR-0015) que vai no PDF do aluno.
// Lista branca fail-safe: só resumo, dimensões (sem evidências/origem/
// confiança), destaques e recomendações. Ficam SEMPRE de fora alertas,
// pendências, mudanças vs. mês anterior e o contexto consolidado.
//
// As chaves de exclusão são por índice ("destaque:0"). Se a avaliação for
// regerada, os índices mudam - mas aí a revisão fica "desatualizada" e o
// personal é obrigado a revisar de novo antes de gerar o PDF, então uma
// chave órfã só faz o item voltar a aparecer (lado seguro).
//
// docs/adr/0029: avaliação física do mês - a tabela (calculada pelo código,
// `avaliacao_fisica_resumo_json`) e o parágrafo da IA para o aluno
// (`avaliacao_json.leitura_avaliacao_fisica`), com chaves fixas
// "avaliacao_fisica:tabela" / "avaliacao_fisica:leitura".
//
// Adendo 2026-11-02 da ADR-0023: o personal pode ajustar o texto de cada trecho
// que vai no PDF (`textos_editados`: { chave do trecho: texto }). A avaliação da
// IA não muda. As chaves seguem a mesma regra de índice das exclusões - por
// isso regerar a avaliação DESCARTA os ajustes (a tela ignora os de uma revisão
// desatualizada), em vez de tentar casá-los com um texto novo.

const SECOES = [
  { secao: 'dimensao', campo: 'dimensoes', rotulo: (d) => d?.nome || 'Dimensão', texto: (d) => d?.evolucao_no_mes || d?.situacao_atual || '' },
  { secao: 'destaque', campo: 'destaques', rotulo: () => 'Destaque', texto: (t) => (typeof t === 'string' ? t : '') },
  { secao: 'recomendacao', campo: 'recomendacoes', rotulo: () => 'Recomendação', texto: (t) => (typeof t === 'string' ? t : '') }
]

export function chaveItem(secao, indice) {
  return `${secao}:${indice}`
}

const CHAVE_TABELA_FISICA = 'avaliacao_fisica:tabela'
const CHAVE_LEITURA_FISICA = 'avaliacao_fisica:leitura'

// Chaves dos trechos editáveis (espelhadas na validação do backend):
// "resumo_geral", "avaliacao_fisica:leitura", "destaque:N", "recomendacao:N" e
// "dimensao:N:situacao_atual" / "dimensao:N:evolucao_no_mes".
export const CHAVE_RESUMO = 'resumo_geral'
export function chaveTextoDimensao(indice, campo) {
  return `dimensao:${indice}:${campo}`
}

function textoLimpo(valor) {
  return typeof valor === 'string' ? valor.trim() : ''
}

function temTabelaFisica(resumoFisica) {
  return Array.isArray(resumoFisica?.linhas) && resumoFisica.linhas.length > 0
}
function leituraFisica(avaliacaoJson) {
  return textoLimpo(avaliacaoJson?.leitura_avaliacao_fisica)
}

// { chave: texto original da IA } de cada trecho editável não vazio.
export function textosOriginais(avaliacaoJson) {
  const av = avaliacaoJson || {}
  const textos = {}
  const guardar = (chave, valor) => {
    const t = textoLimpo(valor)
    if (t) textos[chave] = t
  }
  guardar(CHAVE_RESUMO, av.resumo_geral)
  guardar(CHAVE_LEITURA_FISICA, av.leitura_avaliacao_fisica)
  ;(Array.isArray(av.dimensoes) ? av.dimensoes : []).forEach((d, i) => {
    guardar(chaveTextoDimensao(i, 'situacao_atual'), d?.situacao_atual)
    guardar(chaveTextoDimensao(i, 'evolucao_no_mes'), d?.evolucao_no_mes || d?.evolucao_recente)
  })
  ;(Array.isArray(av.destaques) ? av.destaques : []).forEach((t, i) => guardar(chaveItem('destaque', i), t))
  ;(Array.isArray(av.recomendacoes) ? av.recomendacoes : []).forEach((t, i) => guardar(chaveItem('recomendacao', i), t))
  return textos
}

// O que vai no PUT: só trechos que existem nesta avaliação, não vazios e
// diferentes do original da IA (voltar ao texto da IA = tirar a chave).
export function limparTextosEditados(textosEditados, avaliacaoJson) {
  const originais = textosOriginais(avaliacaoJson)
  const limpo = {}
  for (const [chave, texto] of Object.entries(textosEditados || {})) {
    const t = textoLimpo(texto)
    if (chave in originais && t && t !== originais[chave]) limpo[chave] = t
  }
  return limpo
}

// Algum trecho do item (destaque:0, ou dimensao:0:* da dimensão 0) foi ajustado?
function itemEditado(chave, textosEditados) {
  return Object.keys(textosEditados || {}).some((k) => k === chave || k.startsWith(`${chave}:`))
}

// Cópia da avaliação com os textos ajustados no lugar dos originais (só os
// campos que vão ao aluno; o resto passa intacto).
function aplicarTextos(avaliacaoJson, textosEditados) {
  const av = avaliacaoJson || {}
  const ed = textosEditados || {}
  if (!Object.keys(ed).length) return av
  const ou = (chave, original) => textoLimpo(ed[chave]) || original
  return {
    ...av,
    resumo_geral: ou(CHAVE_RESUMO, av.resumo_geral),
    leitura_avaliacao_fisica: ou(CHAVE_LEITURA_FISICA, av.leitura_avaliacao_fisica),
    dimensoes: Array.isArray(av.dimensoes)
      ? av.dimensoes.map((d, i) => {
          const evolucao = textoLimpo(ed[chaveTextoDimensao(i, 'evolucao_no_mes')])
          return {
            ...d,
            situacao_atual: ou(chaveTextoDimensao(i, 'situacao_atual'), d?.situacao_atual),
            ...(evolucao ? { evolucao_no_mes: evolucao } : {})
          }
        })
      : av.dimensoes,
    destaques: Array.isArray(av.destaques) ? av.destaques.map((t, i) => ou(chaveItem('destaque', i), t)) : av.destaques,
    recomendacoes: Array.isArray(av.recomendacoes)
      ? av.recomendacoes.map((t, i) => ou(chaveItem('recomendacao', i), t))
      : av.recomendacoes
  }
}

// [{ chave, secao, rotulo, texto, editado }] - alimenta o checklist "incluir
// no PDF" (o texto já é o ajustado, quando houver).
export function listarItensExcluiveis(avaliacaoJson, resumoFisica = null, textosEditados = {}) {
  const av = aplicarTextos(avaliacaoJson, textosEditados)
  const itens = []
  if (temTabelaFisica(resumoFisica)) {
    itens.push({ chave: CHAVE_TABELA_FISICA, secao: 'avaliacao_fisica', rotulo: 'Tabela das medidas', texto: `${resumoFisica.linhas.length} medida(s)`, editado: false })
  }
  const leitura = leituraFisica(av)
  if (leitura) {
    itens.push({
      chave: CHAVE_LEITURA_FISICA,
      secao: 'avaliacao_fisica',
      rotulo: 'Leitura da avaliação',
      texto: leitura,
      editado: itemEditado(CHAVE_LEITURA_FISICA, textosEditados)
    })
  }
  for (const { secao, campo, rotulo, texto } of SECOES) {
    const lista = Array.isArray(av[campo]) ? av[campo] : []
    lista.forEach((item, indice) => {
      const chave = chaveItem(secao, indice)
      itens.push({ chave, secao, rotulo: rotulo(item), texto: texto(item), editado: itemEditado(chave, textosEditados) })
    })
  }
  return itens
}

// Avaliação -> objeto pronto para renderizar no documento do aluno, já sem os
// itens excluídos, sem os campos internos das dimensões e com os textos
// ajustados pelo personal. Cada item leva a `chave` (exclusão/edição).
export function filtrarAvaliacaoParaAluno(avaliacaoJson, itensExcluidos = [], resumoFisica = null, textosEditados = {}) {
  const av = aplicarTextos(avaliacaoJson, textosEditados)
  const excluidos = new Set(itensExcluidos || [])
  const incluir = (secao, indice) => !excluidos.has(chaveItem(secao, indice))

  const dimensoes = (Array.isArray(av.dimensoes) ? av.dimensoes : [])
    .map((d, i) => ({ _i: i, d }))
    .filter(({ _i }) => incluir('dimensao', _i))
    .map(({ _i, d }) => ({
      chave: chaveItem('dimensao', _i),
      nome: d?.nome || '',
      situacao_atual: d?.situacao_atual || '',
      evolucao_no_mes: d?.evolucao_no_mes || d?.evolucao_recente || '',
      // "hipotese" precisa continuar visível pro aluno como possibilidade,
      // não fato - avaliações antigas sem o campo não ganham a chave (evita
      // "tipo: undefined" no documento).
      ...(d?.tipo ? { tipo: d.tipo } : {})
    }))

  const destaques = (Array.isArray(av.destaques) ? av.destaques : [])
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => incluir('destaque', i))
    .map(({ t, i }) => ({ chave: chaveItem('destaque', i), texto: t }))

  const recomendacoes = (Array.isArray(av.recomendacoes) ? av.recomendacoes : [])
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => incluir('recomendacao', i))
    .map(({ t, i }) => ({ chave: chaveItem('recomendacao', i), texto: t }))

  // Só os campos de exibição da tabela (lista branca, como o resto).
  const tabela =
    temTabelaFisica(resumoFisica) && !excluidos.has(CHAVE_TABELA_FISICA)
      ? {
          data: resumoFisica.data || null,
          anterior_data: resumoFisica.anterior_data || null,
          linhas: resumoFisica.linhas.map((l) => ({
            rotulo: l.rotulo,
            atual: l.atual,
            anterior: l.anterior ?? null,
            diferenca: l.diferenca ?? null,
            comparavel: l.comparavel !== false
          }))
        }
      : null
  const leitura = excluidos.has(CHAVE_LEITURA_FISICA) ? '' : leituraFisica(av)

  return {
    resumo_geral: av.resumo_geral || '',
    dimensoes,
    destaques,
    recomendacoes,
    avaliacao_fisica: tabela || leitura ? { tabela, leitura } : null
  }
}

// Exclusões sugeridas na primeira preparação: com o parágrafo da avaliação
// física, a dimensão "Composição corporal" diria o mesmo duas vezes no PDF.
// Só um padrão - o personal pode marcar de volta.
export function exclusoesPadrao(avaliacaoJson) {
  if (!leituraFisica(avaliacaoJson)) return []
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const dimensoes = Array.isArray(avaliacaoJson.dimensoes) ? avaliacaoJson.dimensoes : []
  return dimensoes
    .map((d, i) => (normalizar(d?.nome) === 'composicao corporal' ? chaveItem('dimensao', i) : null))
    .filter(Boolean)
}

// A avaliação da IA foi regerada depois da última revisão? (trava o PDF)
export function revisaoDesatualizada(avaliacao, revisao) {
  if (!revisao || !avaliacao) return false
  const geradaEm = avaliacao.gerada_em || avaliacao.geradaEm
  const snapshot = revisao.avaliacao_gerada_em || revisao.avaliacaoGeradaEm
  if (!geradaEm || !snapshot) return false
  return new Date(geradaEm).getTime() > new Date(snapshot).getTime()
}

// A revisão vigente (não desatualizada) tem texto ajustado pelo personal?
// Selo "texto ajustado" e aviso antes de regerar (que descarta os ajustes).
export function temTextoAjustado(avaliacao, revisao) {
  if (!revisao || revisaoDesatualizada(avaliacao, revisao)) return false
  return Object.keys(revisao.textos_editados || {}).length > 0
}
