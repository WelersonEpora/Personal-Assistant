// Gravador de áudio (MediaRecorder). O áudio bruto é o único artefato
// produzido aqui - nenhuma transcrição acontece no dispositivo (docs/adr/
// 0004-armazenamento-offline-cliente.md).
export function criarGravador() {
  let mediaRecorder = null
  let chunks = []
  let stream = null

  async function iniciar() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunks = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorder.ondataavailable = (evento) => {
      if (evento.data.size > 0) chunks.push(evento.data)
    }
    await new Promise((resolve) => {
      mediaRecorder.onstart = resolve
      mediaRecorder.start()
    })
  }

  // Resolve com { blob, mimeType } ou null se nada foi gravado.
  function parar() {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null)
        return
      }
      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm'
        const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null
        stream?.getTracks().forEach((track) => track.stop())
        resolve(blob ? { blob, mimeType } : null)
      }
      mediaRecorder.stop()
    })
  }

  function cancelar() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    stream?.getTracks().forEach((track) => track.stop())
  }

  // Pausa/retoma a mesma gravação - o Blob final continua contínuo, sem o
  // trecho pausado (docs/adr/0021). Sem efeito se o estado não permitir.
  function pausar() {
    if (mediaRecorder?.state === 'recording') mediaRecorder.pause()
  }
  function retomar() {
    if (mediaRecorder?.state === 'paused') mediaRecorder.resume()
  }

  return { iniciar, parar, cancelar, pausar, retomar }
}
