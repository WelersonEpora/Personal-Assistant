import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  hojeYmd,
  chipsDataAtendimento,
  DIAS_RETROATIVOS_CAPTURA,
  CHIPS_DATA_RECENTES,
  rotuloDataAtendimento,
  ehRetroativo,
  formatarDataAtendimento,
  temVariosPersonais
} from './registroStatus.js'

// docs/adr/0019 - helpers da data do atendimento (dia do evento, ≠ data do registro)

test('hojeYmd: AAAA-MM-DD do dia local', () => {
  assert.match(hojeYmd(), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(hojeYmd(new Date(2026, 7, 3)), '2026-08-03')
})

test('chipsDataAtendimento: hoje + 15 dias, Hoje/Ontem nomeados, ordem decrescente, 8 recentes', () => {
  assert.equal(DIAS_RETROATIVOS_CAPTURA, 15)
  const chips = chipsDataAtendimento()
  assert.equal(chips.length, 16)
  assert.equal(chips[0].rotulo, 'Hoje')
  assert.equal(chips[1].rotulo, 'Ontem')
  assert.equal(chips[0].ymd, hojeYmd())
  const hoje = hojeYmd()
  for (const c of chips) assert.ok(c.ymd <= hoje)
  // estritamente decrescente
  for (let i = 1; i < chips.length; i += 1) assert.ok(chips[i].ymd < chips[i - 1].ymd)
  assert.equal(chips.filter((c) => c.recente).length, CHIPS_DATA_RECENTES)
  assert.ok(chips.slice(0, CHIPS_DATA_RECENTES).every((c) => c.recente))
})

test('chipsDataAtendimento: ancorado no início do Registro, não em hoje (nunca oferece data depois do início)', () => {
  // Registro iniciado em 10/08 à noite, retomado em 12/08.
  const chips = chipsDataAtendimento({
    iniciadoEm: new Date(2026, 7, 10, 22, 30).toISOString(),
    agora: new Date(2026, 7, 12, 9, 0)
  })
  assert.equal(chips.length, 16)
  assert.equal(chips[0].ymd, '2026-08-10')
  assert.equal(chips[0].rotulo, 'seg 10')
  assert.equal(chips[15].ymd, '2026-07-26')
  assert.ok(chips.every((c) => c.rotulo !== 'Hoje'))

  const deOntem = chipsDataAtendimento({
    iniciadoEm: new Date(2026, 7, 11, 8, 0).toISOString(),
    agora: new Date(2026, 7, 12, 9, 0)
  })
  assert.equal(deOntem[0].rotulo, 'Ontem')
})

test('rotuloDataAtendimento: hoje/ontem/data cheia e curta', () => {
  assert.equal(rotuloDataAtendimento(hojeYmd()), 'Hoje')
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  assert.equal(rotuloDataAtendimento(hojeYmd(ontem)), 'Ontem')
  assert.equal(rotuloDataAtendimento('2026-01-09'), '09/01/2026')
  assert.equal(rotuloDataAtendimento('2026-01-09', { curto: true }), '09/01')
  assert.equal(rotuloDataAtendimento(''), '')
})

test('ehRetroativo: só quando a data difere de hoje', () => {
  assert.equal(ehRetroativo(hojeYmd()), false)
  assert.equal(ehRetroativo('2020-01-01'), true)
  assert.equal(ehRetroativo(''), false)
})

test('formatarDataAtendimento: AAAA-MM-DD -> DD/MM/AAAA sem shift de fuso', () => {
  assert.equal(formatarDataAtendimento('2026-08-01'), '01/08/2026')
  assert.equal(formatarDataAtendimento('2026-08-01T00:00:00Z'), '01/08/2026')
  assert.equal(formatarDataAtendimento(null), '')
})

test('temVariosPersonais: só true com 2+ usuario_id distintos na lista', () => {
  assert.equal(temVariosPersonais([]), false)
  assert.equal(temVariosPersonais([{ usuario: { id: 'a' } }]), false)
  assert.equal(temVariosPersonais([{ usuario: { id: 'a' } }, { usuario: { id: 'a' } }]), false)
  assert.equal(temVariosPersonais([{ usuario: { id: 'a' } }, { usuario: { id: 'b' } }]), true)
  assert.equal(temVariosPersonais([{ usuario: null }, { }]), false)
})
