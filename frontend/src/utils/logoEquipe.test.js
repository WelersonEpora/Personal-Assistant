import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dimensoesReduzidas, imagemDoDataTransfer } from './logoEquipe.js'

test('dimensoesReduzidas: reduz pelo maior lado mantendo a proporção', () => {
  assert.deepEqual(dimensoesReduzidas(2048, 1024), { largura: 512, altura: 256 })
  assert.deepEqual(dimensoesReduzidas(600, 1200), { largura: 256, altura: 512 })
})

test('dimensoesReduzidas: não amplia imagem pequena', () => {
  assert.deepEqual(dimensoesReduzidas(200, 80), { largura: 200, altura: 80 })
  assert.deepEqual(dimensoesReduzidas(512, 512), { largura: 512, altura: 512 })
})

test('dimensoesReduzidas: lado muito fino não vira zero', () => {
  assert.deepEqual(dimensoesReduzidas(5000, 2), { largura: 512, altura: 1 })
})

function item(kind, type, arquivo) {
  return { kind, type, getAsFile: () => arquivo }
}

test('imagemDoDataTransfer: pega a primeira imagem aceita dos items (colar)', () => {
  const png = { name: 'image.png', type: 'image/png' }
  const dt = { items: [item('string', 'text/plain', null), item('file', 'image/png', png)], files: [] }
  assert.equal(imagemDoDataTransfer(dt), png)
})

test('imagemDoDataTransfer: cai para files (arrastar e soltar)', () => {
  const jpeg = { name: 'logo.jpg', type: 'image/jpeg' }
  assert.equal(imagemDoDataTransfer({ items: [], files: [jpeg] }), jpeg)
})

test('imagemDoDataTransfer: texto, SVG ou nada devolvem null', () => {
  assert.equal(imagemDoDataTransfer({ items: [item('string', 'text/plain', null)], files: [] }), null)
  assert.equal(imagemDoDataTransfer({ items: [item('file', 'image/svg+xml', {})], files: [{ type: 'image/svg+xml' }] }), null)
  assert.equal(imagemDoDataTransfer(null), null)
})
