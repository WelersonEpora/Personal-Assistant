import { openDB } from 'idb'

// docs/adr/0004-armazenamento-offline-cliente.md: IndexedDB via idb.
// Blobs de áudio ficam num object store separado dos metadados do Registro
// (nunca inflando consultas de listagem com payload binário grande).
const DB_NAME = 'personal-assistant'
const DB_VERSION = 1

let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('alunos')) {
          db.createObjectStore('alunos', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('registros')) {
          db.createObjectStore('registros', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('audios')) {
          const store = db.createObjectStore('audios', { keyPath: ['registroId', 'ordem'] })
          store.createIndex('porRegistro', 'registroId')
        }
      }
    })
  }
  return dbPromise
}

// ---- alunos: cache local para seleção offline (seção 3 do pedido) ----
export async function salvarAlunosCache(alunos) {
  const db = await getDb()
  const tx = db.transaction('alunos', 'readwrite')
  await tx.store.clear()
  await Promise.all(alunos.map((aluno) => tx.store.put(aluno)))
  await tx.done
}

export async function listarAlunosCache() {
  const db = await getDb()
  return db.getAll('alunos')
}

// ---- registros finalizados, aguardando ou em processo de sincronização ----
// O objeto pode vir de dentro de um state reactivo do Pinia (Proxy) -
// IndexedDB lança DataCloneError ao tentar clonar um Proxy diretamente,
// mesmo quando todo o dado subjacente é serializável. O round-trip JSON
// garante um objeto plano antes do put (seguro aqui: registroLocal só tem
// primitivas/arrays/objetos - o Blob de áudio vive à parte, em "audios").
export async function salvarRegistroLocal(registro) {
  const db = await getDb()
  await db.put('registros', JSON.parse(JSON.stringify(registro)))
}

export async function listarRegistrosLocais() {
  const db = await getDb()
  const todos = await db.getAll('registros')
  return todos.sort((a, b) => (a.iniciadoEm < b.iniciadoEm ? 1 : -1))
}

// Depois que o servidor confirma o recebimento (docs/adr/0005), o Registro
// local e seus áudios deixam de ser necessários no dispositivo.
export async function removerRegistroLocal(id) {
  const db = await getDb()
  const tx = db.transaction(['registros', 'audios'], 'readwrite')
  await tx.objectStore('registros').delete(id)

  const indice = tx.objectStore('audios').index('porRegistro')
  let cursor = await indice.openCursor(IDBKeyRange.only(id))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }

  await tx.done
}

// ---- blobs de áudio brutos (nunca transcritos no dispositivo) ----
export async function salvarAudioLocal(registroId, ordem, blob) {
  const db = await getDb()
  await db.put('audios', { registroId, ordem, blob })
}

export async function obterAudioLocal(registroId, ordem) {
  const db = await getDb()
  const registro = await db.get('audios', [registroId, ordem])
  return registro?.blob ?? null
}

// Remove um único áudio (ex.: entrada apagada de um Registro ainda em
// andamento, sem descartar o Registro inteiro).
export async function removerAudioLocal(registroId, ordem) {
  const db = await getDb()
  await db.delete('audios', [registroId, ordem])
}
