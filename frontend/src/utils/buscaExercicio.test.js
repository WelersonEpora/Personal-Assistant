import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizarTexto, correspondencia, filtrarExercicios } from './buscaExercicio.js'

const SERROTE = {
  id: 'serrote',
  nome: 'Serrote',
  grupo_muscular: 'Costas',
  equipamento: 'Halteres',
  apelidos: [{ apelido: 'remada unilateral' }, { apelido: 'remada com halter' }]
}
const REMADA_BAIXA = { id: 'remada-baixa', nome: 'Remada baixa', grupo_muscular: 'Costas', equipamento: 'Polia (cabo)', apelidos: [] }
const TRICEPS_CORDA = { id: 'triceps-corda', nome: 'Tríceps corda', grupo_muscular: 'Tríceps', equipamento: 'Polia (cabo)' }

test('normalizarTexto: ignora acento, caixa e espaços repetidos', () => {
  assert.equal(normalizarTexto('  Tríceps   CORDA '), 'triceps corda')
})

test('correspondencia: acha pelo apelido e diz qual apelido respondeu', () => {
  assert.deepEqual(correspondencia(SERROTE, 'remada unilateral'), { pontos: 4, apelido: 'remada unilateral' })
})

test('correspondencia: nome sem acento responde (triceps → Tríceps corda)', () => {
  assert.equal(correspondencia(TRICEPS_CORDA, 'triceps').pontos, 3)
  assert.equal(correspondencia(TRICEPS_CORDA, 'triceps').apelido, null)
})

test('correspondencia: palavras fora de ordem, no mesmo nome/apelido', () => {
  assert.equal(correspondencia(SERROTE, 'halter remada').pontos, 2)
})

test('correspondencia: grupo e equipamento só como último recurso', () => {
  assert.equal(correspondencia(REMADA_BAIXA, 'costas cabo').pontos, 1)
  assert.equal(correspondencia(REMADA_BAIXA, 'peito').pontos, 0)
})

test('filtrarExercicios: exato antes de parcial; empate mantém a ordem da lista', () => {
  const resultado = filtrarExercicios([REMADA_BAIXA, SERROTE, TRICEPS_CORDA], 'remada')
  assert.deepEqual(resultado.map((r) => r.exercicio.id), ['remada-baixa', 'serrote'])

  const exato = filtrarExercicios([REMADA_BAIXA, SERROTE], 'remada com halter')
  assert.deepEqual(exato.map((r) => [r.exercicio.id, r.apelido]), [['serrote', 'remada com halter']])
})

test('filtrarExercicios: sem termo devolve todos, na ordem', () => {
  assert.deepEqual(filtrarExercicios([SERROTE, TRICEPS_CORDA], '  ').map((r) => r.exercicio.id), ['serrote', 'triceps-corda'])
})
