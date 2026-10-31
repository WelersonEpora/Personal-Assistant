// Busca no catálogo de exercícios por nome e apelidos (docs/adr/0027), sem
// acento e sem caixa. Usada no editor da ficha e na listagem de exercícios.
// normalizarTexto espelha backend/src/shared/utils/texto.js.

export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function palavras(termo) {
  return normalizarTexto(termo).split(' ').filter(Boolean)
}

function contemTodas(texto, lista) {
  const alvo = normalizarTexto(texto)
  return lista.every((palavra) => alvo.includes(palavra))
}

// Quão bem o exercício responde ao termo: 0 = não responde. Todas as palavras
// do termo precisam estar num mesmo nome/apelido (ou, por último, no conjunto
// nome + grupo + equipamento). `apelido` vem preenchido quando foi um apelido
// que respondeu e o nome não - a tela mostra por que o exercício apareceu.
export function correspondencia(exercicio, termo) {
  const lista = palavras(termo)
  if (!lista.length) return { pontos: 1, apelido: null }

  const termoNormalizado = lista.join(' ')
  const apelidos = (exercicio.apelidos || []).map((a) => a.apelido)
  const candidatos = [{ texto: exercicio.nome, apelido: null }, ...apelidos.map((apelido) => ({ texto: apelido, apelido }))]

  let melhor = { pontos: 0, apelido: null }
  for (const { texto, apelido } of candidatos) {
    const normalizado = normalizarTexto(texto)
    let pontos = 0
    if (normalizado === termoNormalizado) pontos = 4
    else if (normalizado.startsWith(termoNormalizado)) pontos = 3
    else if (contemTodas(normalizado, lista)) pontos = 2
    if (pontos > melhor.pontos) melhor = { pontos, apelido }
  }
  if (melhor.pontos) return melhor

  const contexto = [exercicio.nome, exercicio.grupo_muscular, exercicio.equipamento].filter(Boolean).join(' ')
  return contemTodas(contexto, lista) ? { pontos: 1, apelido: null } : { pontos: 0, apelido: null }
}

// Exercícios que respondem ao termo, os mais exatos primeiro; empate mantém a
// ordem recebida (a API já devolve por nome). Sem termo, devolve tudo.
export function filtrarExercicios(exercicios, termo) {
  return exercicios
    .map((exercicio, indice) => ({ exercicio, indice, ...correspondencia(exercicio, termo) }))
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice)
    .map(({ exercicio, apelido }) => ({ exercicio, apelido }))
}
