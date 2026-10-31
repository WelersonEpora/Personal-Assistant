// Ficha de Treino com grupos (docs/adr/0026): todo exercício pertence a um
// grupo. Um exercício isolado é um grupo "simples"; bi-set, tri-set e circuito
// juntam exercícios feitos em sequência, com as séries (voltas) e o descanso
// valendo para o grupo. Helpers puros do editor e da leitura - sem Vue, testados.

export const TIPOS_GRUPO = {
  simples: 'Exercício',
  biset: 'Bi-set',
  triset: 'Tri-set',
  circuito: 'Circuito'
}

// Mesma regra do service: simples = 1, bi-set = 2, tri-set = 3, circuito ≥ 2.
export function tiposPermitidos(quantidade) {
  if (quantidade <= 1) return ['simples']
  if (quantidade === 2) return ['biset', 'circuito']
  if (quantidade === 3) return ['triset', 'circuito']
  return ['circuito']
}

// Mantém a escolha do personal quando ela ainda vale para a nova quantidade
// (ex.: circuito de 3 que ganhou um 4º); senão, o primeiro tipo permitido.
export function tipoParaQuantidade(quantidade, tipoAtual) {
  const permitidos = tiposPermitidos(quantidade)
  return permitidos.includes(tipoAtual) ? tipoAtual : permitidos[0]
}

export function ehConjugado(grupo) {
  return grupo.tipo !== 'simples'
}

let sequencia = 0
function novaChave() {
  sequencia += 1
  return `g${sequencia}`
}

// ------------------------------------------------------------ formulário

// Item do formulário a partir de um exercício do catálogo (snake_case da API).
export function itemDoExercicio(exercicio, { repeticoes = '', cargaObs = '' } = {}) {
  return {
    chave: novaChave(),
    exercicioId: exercicio.id,
    nome: exercicio.nome,
    grupoMuscular: exercicio.grupo_muscular,
    temImagemInicio: Boolean(exercicio.midia_imagem_inicio_caminho),
    temImagemFim: Boolean(exercicio.midia_imagem_fim_caminho),
    midiaVideoUrl: exercicio.midia_video_url,
    instrucoes: exercicio.instrucoes,
    repeticoes,
    cargaObs
  }
}

export function grupoSimples(item, { series = '', descanso = '' } = {}) {
  return { chave: novaChave(), tipo: 'simples', series, descanso, observacoes: '', itens: [item] }
}

// Formulário de edição a partir de uma ficha salva (nova versão dela).
export function formularioDaFicha(ficha) {
  return (ficha?.grupos || []).map((grupo) => ({
    chave: novaChave(),
    tipo: grupo.tipo,
    series: grupo.series ?? '',
    descanso: grupo.descanso || '',
    observacoes: grupo.observacoes || '',
    itens: (grupo.itens || []).map((item) =>
      itemDoExercicio(item.exercicio, { repeticoes: item.repeticoes || '', cargaObs: item.carga_obs || '' })
    )
  }))
}

// Junta o grupo `indice` com o seguinte. Voltas e descanso vêm do primeiro
// (ou do segundo, se o primeiro estiver em branco).
export function conjugarComProximo(grupos, indice) {
  const atual = grupos[indice]
  const proximo = grupos[indice + 1]
  if (!atual || !proximo) return grupos
  const itens = [...atual.itens, ...proximo.itens]
  const tipoPreferido = atual.tipo === 'circuito' || proximo.tipo === 'circuito' ? 'circuito' : atual.tipo
  const unido = {
    ...atual,
    tipo: tipoParaQuantidade(itens.length, tipoPreferido),
    series: atual.series !== '' ? atual.series : proximo.series,
    descanso: atual.descanso || proximo.descanso,
    observacoes: [atual.observacoes, proximo.observacoes].filter(Boolean).join('\n'),
    itens
  }
  return [...grupos.slice(0, indice), unido, ...grupos.slice(indice + 2)]
}

// Desfaz o grupo: cada exercício vira um grupo simples, herdando as voltas
// como séries e o descanso.
export function separarGrupo(grupos, indice) {
  const grupo = grupos[indice]
  if (!grupo) return grupos
  const separados = grupo.itens.map((item) => grupoSimples(item, { series: grupo.series, descanso: grupo.descanso }))
  return [...grupos.slice(0, indice), ...separados, ...grupos.slice(indice + 1)]
}

// Remove um exercício; grupo vazio some, grupo que fica com 1 vira simples.
export function removerItem(grupos, indiceGrupo, indiceItem) {
  const grupo = grupos[indiceGrupo]
  if (!grupo) return grupos
  const itens = grupo.itens.filter((_, i) => i !== indiceItem)
  if (!itens.length) return grupos.filter((_, i) => i !== indiceGrupo)
  const atualizado = { ...grupo, itens, tipo: tipoParaQuantidade(itens.length, grupo.tipo) }
  return grupos.map((g, i) => (i === indiceGrupo ? atualizado : g))
}

function moverNaLista(lista, indice, direcao) {
  const alvo = indice + direcao
  if (alvo < 0 || alvo >= lista.length) return lista
  const copia = [...lista]
  const [elemento] = copia.splice(indice, 1)
  copia.splice(alvo, 0, elemento)
  return copia
}

export function moverGrupo(grupos, indice, direcao) {
  return moverNaLista(grupos, indice, direcao)
}

export function moverItem(grupos, indiceGrupo, indiceItem, direcao) {
  return grupos.map((g, i) => (i === indiceGrupo ? { ...g, itens: moverNaLista(g.itens, indiceItem, direcao) } : g))
}

// Corpo de POST /alunos/:id/fichas-treino.
export function payloadDosGrupos(grupos) {
  const texto = (valor) => String(valor ?? '').trim() || null
  return grupos.map((grupo) => ({
    tipo: grupo.tipo,
    series: grupo.series !== '' && grupo.series !== null ? Number(grupo.series) : null,
    descanso: texto(grupo.descanso),
    observacoes: texto(grupo.observacoes),
    itens: grupo.itens.map((item) => ({
      exercicioId: item.exercicioId,
      repeticoes: texto(item.repeticoes),
      cargaObs: texto(item.cargaObs)
    }))
  }))
}

// Mensagem do primeiro problema que impede salvar, ou null.
export function problemaDoFormulario({ nome, grupos }) {
  if (!String(nome ?? '').trim()) return 'Dê um nome à ficha — é o que diferencia uma ficha da outra.'
  if (!grupos.length) return 'Adicione pelo menos um exercício.'
  return null
}

// --------------------------------------------------------------- leitura

// "30s", "1min", "45 seg" - tempo não leva o sufixo "repetições".
const PARECE_TEMPO = /\d\s*(s|seg|segundos?|min|minutos?)\b/i

export function rotuloRepeticoes(repeticoes) {
  if (!repeticoes) return ''
  return PARECE_TEMPO.test(repeticoes) ? repeticoes : `${repeticoes} repetições`
}

// Linha de detalhe de um grupo simples: "4 séries · 12 repetições · descanso 60s".
export function resumoSimples(grupo, item) {
  const partes = []
  if (grupo.series) partes.push(`${grupo.series} ${grupo.series === 1 ? 'série' : 'séries'}`)
  if (item?.repeticoes) partes.push(rotuloRepeticoes(item.repeticoes))
  if (grupo.descanso) partes.push(`descanso ${grupo.descanso}`)
  return partes.join(' · ')
}

// Cabeçalho de um grupo conjugado: "Circuito · 2 voltas · descanso 60s entre voltas".
export function resumoConjugado(grupo) {
  const partes = [TIPOS_GRUPO[grupo.tipo] || grupo.tipo]
  if (grupo.series) partes.push(`${grupo.series} ${grupo.series === 1 ? 'volta' : 'voltas'}`)
  if (grupo.descanso) partes.push(`descanso ${grupo.descanso} entre voltas`)
  return partes.join(' · ')
}

// Numeração de leitura: grupo simples "3"; exercícios de um conjugado "3A", "3B".
export function rotuloPosicao(grupo, indiceGrupo, indiceItem) {
  const numero = indiceGrupo + 1
  return ehConjugado(grupo) ? `${numero}${String.fromCharCode(65 + indiceItem)}` : String(numero)
}

export function contarExercicios(ficha) {
  return (ficha?.grupos || []).reduce((total, grupo) => total + (grupo.itens?.length || 0), 0)
}

// Ficha inativa: "substituída" se alguma ficha aponta para ela via
// substitui_id, senão "arquivada" (docs/adr/0026 - sem coluna própria).
export function situacaoInativa(ficha, todas) {
  return todas.some((outra) => outra.substitui_id === ficha.id) ? 'substituida' : 'arquivada'
}

// Ativas em ordem de nome (o servidor já ordena a lista pública; a tela do
// personal recebe todas as fichas por created_at).
export function ordenarPorNome(fichas) {
  return [...fichas].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }))
}
