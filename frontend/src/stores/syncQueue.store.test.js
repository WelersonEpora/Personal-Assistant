// docs/adr/0005-estrategia-sincronizacao.md: a fila local só avança um
// Registro por vez, remove do dispositivo só depois de sucesso confirmado
// pelo servidor, e mantém (para nova tentativa) o que falhou - nunca perde
// nem trava o Registro num limbo. registros.service é mockado (mock.method,
// mesmo padrão do gemini.service.test.js do AgroMind) - nenhuma chamada
// HTTP real nestes testes.
import 'fake-indexeddb/auto'
import { test, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncQueueStore } from './syncQueue.store.js'
import registrosService from '../services/registros.service.js'
import { listarRegistrosLocais, removerRegistroLocal } from '../offline/db.js'

// O IndexedDB fake é um módulo compartilhado por todo o arquivo de teste
// (mesmo processo) - sem isolar entre testes, um Registro deixado
// "pendente_sincronizacao" por um teste (ex.: o mock que nunca resolve)
// vazaria para a fila do próximo teste e inflaria a contagem de chamadas.
beforeEach(async () => {
  const restantes = await listarRegistrosLocais()
  await Promise.all(restantes.map((r) => removerRegistroLocal(r.id)))
})

function registroLocal(id, overrides = {}) {
  return {
    id,
    alunoId: 'aluno-1',
    titulo: '',
    iniciadoEm: new Date().toISOString(),
    status: 'pendente_sincronizacao',
    entradas: [{ ordem: 0, tipo: 'texto', conteudoTexto: 'Entrada de teste.' }],
    ...overrides
  }
}

function novaStoreOnline() {
  setActivePinia(createPinia())
  const store = useSyncQueueStore()
  store.online = true
  return store
}

test('salvarLocal grava o Registro localmente e ele aparece em registrosLocais', async () => {
  const store = novaStoreOnline()
  mock.method(registrosService, 'sincronizar', async () => new Promise(() => {})) // nunca resolve neste teste
  store.online = false // evita disparar processarFila automaticamente

  await store.salvarLocal(registroLocal('reg-a'))

  assert.ok(store.registrosLocais.some((r) => r.id === 'reg-a'))
  mock.restoreAll()
})

test('processarFila: sucesso remove o Registro do dispositivo', async () => {
  const store = novaStoreOnline()
  const chamadaSincronizar = mock.method(registrosService, 'sincronizar', async () => ({ id: 'reg-b', status: 'recebido' }))

  await store.salvarLocal(registroLocal('reg-b'))
  await store.processarFila()

  assert.equal(chamadaSincronizar.mock.callCount(), 1)
  assert.equal(store.registrosLocais.some((r) => r.id === 'reg-b'), false)
  mock.restoreAll()
})

// docs/adr/0018 - o tipo do Registro acompanha a sincronização.
test('processarFila: o tipo do Registro chega ao serviço de sincronização', async () => {
  const store = novaStoreOnline()
  const chamadaSincronizar = mock.method(registrosService, 'sincronizar', async () => ({ id: 'reg-tipo', status: 'recebido' }))

  await store.salvarLocal(registroLocal('reg-tipo', { tipo: 'avaliacao_fisica' }))
  await store.processarFila()

  assert.equal(chamadaSincronizar.mock.calls[0].arguments[0].tipo, 'avaliacao_fisica')
  mock.restoreAll()
})

test('processarFila: falha mantém o Registro local como erro_sincronizacao (não perde o dado)', async () => {
  const store = novaStoreOnline()
  mock.method(registrosService, 'sincronizar', async () => {
    throw new Error('rede instável')
  })

  await store.salvarLocal(registroLocal('reg-c'))
  await store.processarFila()

  const local = store.registrosLocais.find((r) => r.id === 'reg-c')
  assert.ok(local, 'o Registro deve continuar no dispositivo depois de falhar')
  assert.equal(local.status, 'erro_sincronizacao')
  mock.restoreAll()
})

test('processarFila: um Registro em erro_sincronizacao é retentado na próxima chamada', async () => {
  const store = novaStoreOnline()
  let tentativas = 0
  mock.method(registrosService, 'sincronizar', async () => {
    tentativas += 1
    if (tentativas === 1) throw new Error('falha temporária')
    return { id: 'reg-d', status: 'recebido' }
  })

  await store.salvarLocal(registroLocal('reg-d'))
  await store.processarFila() // falha
  assert.equal(store.registrosLocais.find((r) => r.id === 'reg-d')?.status, 'erro_sincronizacao')

  await store.processarFila() // retry, sucesso
  assert.equal(tentativas, 2)
  assert.equal(store.registrosLocais.some((r) => r.id === 'reg-d'), false)
  mock.restoreAll()
})

test('processarFila: offline nunca chama o serviço de sincronização', async () => {
  const store = novaStoreOnline()
  const chamadaSincronizar = mock.method(registrosService, 'sincronizar', async () => ({ id: 'reg-e', status: 'recebido' }))
  store.online = false

  await store.salvarLocal(registroLocal('reg-e'))
  await store.processarFila()

  assert.equal(chamadaSincronizar.mock.callCount(), 0)
  assert.ok(store.registrosLocais.some((r) => r.id === 'reg-e'), 'continua salvo localmente, aguardando conexão')
  mock.restoreAll()
})

// docs/adr/0012-registros-em-andamento-simultaneos.md: um Registro 'em_andamento'
// é rascunho, nunca fila de sincronização.
test('processarFila nunca sincroniza um Registro em_andamento', async () => {
  const store = novaStoreOnline()
  const chamadaSincronizar = mock.method(registrosService, 'sincronizar', async () => ({ id: 'reg-f', status: 'recebido' }))

  await store.salvarLocal(registroLocal('reg-f', { status: 'em_andamento' }))
  await store.processarFila()

  assert.equal(chamadaSincronizar.mock.callCount(), 0)
  assert.equal(store.registrosLocais.find((r) => r.id === 'reg-f')?.status, 'em_andamento')
  mock.restoreAll()
})

test('pendentes exclui Registros em_andamento da contagem', async () => {
  const store = novaStoreOnline()
  await store.salvarLocal(registroLocal('reg-g', { status: 'em_andamento' }))
  await store.salvarLocal(registroLocal('reg-h', { status: 'pendente_sincronizacao' }))

  assert.equal(store.pendentes.length, 1)
  assert.equal(store.pendentes[0].id, 'reg-h')
})
