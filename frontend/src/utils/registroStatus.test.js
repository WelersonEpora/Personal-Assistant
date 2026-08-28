import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  hojeYmd,
  chipsDataAtendimento,
  rotuloDataAtendimento,
  ehRetroativo,
  formatarDataAtendimento
} from './registroStatus.js'

// docs/adr/0019 - helpers da data do atendimento (dia do evento, ≠ data do registro)

test('hojeYmd: AAAA-MM-DD do dia local', () => {
  assert.match(hojeYmd(), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(hojeYmd(new Date(2026, 7, 3)), '2026-08-03')
})

test('chipsDataAtendimento: 8 dias, Hoje/Ontem nomeados, ordem decrescente, todos <= hoje', () => {
  const chips = chipsDataAtendimento(8)
  assert.equal(chips.length, 8)
  assert.equal(chips[0].rotulo, 'Hoje')
  assert.equal(chips[1].rotulo, 'Ontem')
  assert.equal(chips[0].ymd, hojeYmd())
  const hoje = hojeYmd()
  for (const c of chips) assert.ok(c.ymd <= hoje)
  // estritamente decrescente
  for (let i = 1; i < chips.length; i += 1) assert.ok(chips[i].ymd < chips[i - 1].ymd)
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
