import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolverGesto,
  progressoTravar,
  estadoDuracao,
  formatarCronometro,
  criarRelogioGravacao,
  LIMIAR_TRAVAR_PX,
  AVISO_GRAVACAO_LONGA_MS
} from './gravacaoVoz.js'

// docs/adr/0021 - gesto de travar e aviso de gravação longa

test('resolverGesto: só trava quando o dedo sobe além do limiar', () => {
  assert.equal(resolverGesto({ dy: 0 }), 'nada')
  assert.equal(resolverGesto({ dy: 20 }), 'nada') // dedo desceu
  assert.equal(resolverGesto({ dy: -(LIMIAR_TRAVAR_PX - 1) }), 'nada')
  assert.equal(resolverGesto({ dy: -LIMIAR_TRAVAR_PX }), 'travar')
  assert.equal(resolverGesto({ dy: -200 }), 'travar')
  assert.equal(resolverGesto(), 'nada')
})

test('progressoTravar: 0..1 proporcional à subida', () => {
  assert.equal(progressoTravar(0), 0)
  assert.equal(progressoTravar(30), 0) // descendo => 0
  assert.equal(progressoTravar(-LIMIAR_TRAVAR_PX / 2), 0.5)
  assert.equal(progressoTravar(-LIMIAR_TRAVAR_PX), 1)
  assert.equal(progressoTravar(-999), 1)
})

test('estadoDuracao: vira "longa" exatamente aos 3 min', () => {
  assert.equal(estadoDuracao(0), 'normal')
  assert.equal(estadoDuracao(AVISO_GRAVACAO_LONGA_MS - 1), 'normal')
  assert.equal(estadoDuracao(AVISO_GRAVACAO_LONGA_MS), 'longa')
  assert.equal(estadoDuracao(AVISO_GRAVACAO_LONGA_MS + 5000), 'longa')
})

test('formatarCronometro: m:ss com segundos zero-padded', () => {
  assert.equal(formatarCronometro(0), '0:00')
  assert.equal(formatarCronometro(9000), '0:09')
  assert.equal(formatarCronometro(65000), '1:05')
  assert.equal(formatarCronometro(600000), '10:00')
  assert.equal(formatarCronometro(-50), '0:00')
})

test('criarRelogioGravacao: soma só os segmentos ativos, ignora o tempo pausado', () => {
  let t = 1000
  const rel = criarRelogioGravacao(() => t)

  rel.iniciar()            // t=1000
  t = 4000
  assert.equal(rel.decorridoMs(), 3000)

  rel.pausar()             // congela em 3000
  t = 10000
  assert.equal(rel.decorridoMs(), 3000)

  rel.retomar()            // t=10000
  t = 12500
  assert.equal(rel.decorridoMs(), 5500) // 3000 + 2500

  rel.pausar()
  t = 99999
  assert.equal(rel.decorridoMs(), 5500)

  rel.iniciar()            // zera
  t = 100000
  assert.equal(rel.decorridoMs(), 1)
})

test('criarRelogioGravacao: retomar sem pausar não faz nada; pausar duas vezes idem', () => {
  let t = 0
  const rel = criarRelogioGravacao(() => t)
  rel.iniciar()
  t = 2000
  rel.retomar() // no-op, ainda rodando
  assert.equal(rel.decorridoMs(), 2000)
  rel.pausar()
  t = 3000
  rel.pausar() // no-op
  assert.equal(rel.decorridoMs(), 2000)
})
