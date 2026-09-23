// docs/adr/0024 - o espelho do frontend precisa dar o mesmo número que o
// backend (mesmos casos de referência do BodyMove).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calcularPercentualGordura, descreverFaltando, DOBRAS_POR_PROTOCOLO } from './protocolosGordura.js'

function dobras(valores) {
  return Object.fromEntries(DOBRAS_POR_PROTOCOLO.pollock_7.map((c, i) => [c, valores[i]]))
}

test('pollock_7 bate com o BodyMove (mulher 20+, homem 20+, homem 18)', () => {
  const casos = [
    { sexo: 'F', idade: 43, v: [9, 7, 14, 10, 15, 9, 22], esperado: 17.67 },
    { sexo: 'M', idade: 29, v: [11, 12, 10, 15, 27, 23, 18], esperado: 16.72 },
    { sexo: 'M', idade: 18, v: [4, 4, 5, 6, 6, 5, 7], esperado: 3.27 }
  ]
  for (const c of casos) {
    const r = calcularPercentualGordura('pollock_7', { dobras: dobras(c.v), sexo: c.sexo, idade: c.idade })
    assert.ok(Math.abs(r.percentual - c.esperado) < 0.01, `${c.sexo}/${c.idade}: ${r.percentual}`)
  }
})

test('aceita valores em string (vêm do input do formulário)', () => {
  const r = calcularPercentualGordura('pollock_7', {
    dobras: dobras(['9', '7', '14', '10', '15', '9', '22']),
    sexo: 'F',
    idade: 43
  })
  assert.equal(r.percentual.toFixed(1), '17.7')
})

test('descreverFaltando agrupa cadastro e dobras', () => {
  const r = calcularPercentualGordura('pollock_7', { dobras: {}, sexo: null, idade: null })
  const frases = descreverFaltando(r.faltando, (c) => c.replace('dobra_', ''))
  assert.equal(frases[0], 'no cadastro do aluno: sexo e data de nascimento')
  assert.match(frases[1], /^dobras: peitoral, axilar_media/)
})
