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

const SECOES = [
  { secao: 'dimensao', campo: 'dimensoes', rotulo: (d) => d?.nome || 'Dimensão', texto: (d) => d?.evolucao_no_mes || d?.situacao_atual || '' },
  { secao: 'destaque', campo: 'destaques', rotulo: () => 'Destaque', texto: (t) => (typeof t === 'string' ? t : '') },
  { secao: 'recomendacao', campo: 'recomendacoes', rotulo: () => 'Recomendação', texto: (t) => (typeof t === 'string' ? t : '') }
]

export function chaveItem(secao, indice) {
  return `${secao}:${indice}`
}

// [{ chave, secao, rotulo, texto }] - alimenta o checklist "incluir no PDF".
export function listarItensExcluiveis(avaliacaoJson) {
  const av = avaliacaoJson || {}
  const itens = []
  for (const { secao, campo, rotulo, texto } of SECOES) {
    const lista = Array.isArray(av[campo]) ? av[campo] : []
    lista.forEach((item, indice) => {
      itens.push({ chave: chaveItem(secao, indice), secao, rotulo: rotulo(item), texto: texto(item) })
    })
  }
  return itens
}

// Avaliação -> objeto pronto para renderizar no documento do aluno, já sem os
// itens excluídos e sem os campos internos das dimensões.
export function filtrarAvaliacaoParaAluno(avaliacaoJson, itensExcluidos = []) {
  const av = avaliacaoJson || {}
  const excluidos = new Set(itensExcluidos || [])
  const incluir = (secao, indice) => !excluidos.has(chaveItem(secao, indice))

  const dimensoes = (Array.isArray(av.dimensoes) ? av.dimensoes : [])
    .map((d, i) => ({ _i: i, d }))
    .filter(({ _i }) => incluir('dimensao', _i))
    .map(({ d }) => ({
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
    .map(({ t }) => t)

  const recomendacoes = (Array.isArray(av.recomendacoes) ? av.recomendacoes : [])
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => incluir('recomendacao', i))
    .map(({ t }) => t)

  return {
    resumo_geral: av.resumo_geral || '',
    dimensoes,
    destaques,
    recomendacoes
  }
}

// A avaliação da IA foi regerada depois da última revisão? (trava o PDF)
export function revisaoDesatualizada(avaliacao, revisao) {
  if (!revisao || !avaliacao) return false
  const geradaEm = avaliacao.gerada_em || avaliacao.geradaEm
  const snapshot = revisao.avaliacao_gerada_em || revisao.avaliacaoGeradaEm
  if (!geradaEm || !snapshot) return false
  return new Date(geradaEm).getTime() > new Date(snapshot).getTime()
}
