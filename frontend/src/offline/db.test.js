// Testes de integração contra um IndexedDB real em memória (fake-indexeddb)
// - cobre as garantias de docs/adr/0004-armazenamento-offline-cliente.md:
// metadados e Blobs de áudio ficam em stores separados, e um Registro
// removido localmente (depois de sincronizar) limpa também seus áudios.
import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  salvarRegistroLocal,
  listarRegistrosLocais,
  removerRegistroLocal,
  salvarAudioLocal,
  obterAudioLocal
} from './db.js'

test('salvarRegistroLocal aceita um objeto vindo de um Proxy reativo (round-trip JSON)', async () => {
  const alvo = { id: 'r1', alunoId: 'a1', titulo: '', iniciadoEm: new Date().toISOString(), status: 'pendente_sincronizacao', entradas: [] }
  const proxyReativo = new Proxy(alvo, {})

  await assert.doesNotReject(() => salvarRegistroLocal(proxyReativo))

  const todos = await listarRegistrosLocais()
  assert.equal(todos.find((r) => r.id === 'r1')?.status, 'pendente_sincronizacao')
})

test('listarRegistrosLocais ordena do mais recente para o mais antigo (por iniciadoEm)', async () => {
  await salvarRegistroLocal({ id: 'ordem-1', alunoId: 'a1', titulo: '', iniciadoEm: '2026-08-25T08:00:00.000Z', status: 'pendente_sincronizacao', entradas: [] })
  await salvarRegistroLocal({ id: 'ordem-2', alunoId: 'a1', titulo: '', iniciadoEm: '2026-08-25T10:00:00.000Z', status: 'pendente_sincronizacao', entradas: [] })

  const todos = await listarRegistrosLocais()
  const indice1 = todos.findIndex((r) => r.id === 'ordem-1')
  const indice2 = todos.findIndex((r) => r.id === 'ordem-2')
  assert.ok(indice2 < indice1, 'o Registro mais recente (ordem-2) deve vir antes do mais antigo (ordem-1)')
})

test('removerRegistroLocal remove também os áudios associados (nunca deixa órfão)', async () => {
  const registro = { id: 'r-audio', alunoId: 'a1', titulo: '', iniciadoEm: new Date().toISOString(), status: 'pendente_sincronizacao', entradas: [{ ordem: 0, tipo: 'audio', duracaoSegundos: 5 }] }
  await salvarRegistroLocal(registro)
  await salvarAudioLocal('r-audio', 0, new Blob(['conteudo-fake'], { type: 'audio/webm' }))

  assert.ok(await obterAudioLocal('r-audio', 0), 'o áudio devia existir antes da remoção')

  await removerRegistroLocal('r-audio')

  const todos = await listarRegistrosLocais()
  assert.equal(todos.find((r) => r.id === 'r-audio'), undefined)
  assert.equal(await obterAudioLocal('r-audio', 0), null)
})
