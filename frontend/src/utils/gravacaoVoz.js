// docs/adr/0021 - interação de gravação de voz estilo WhatsApp.
// Helpers puros e testáveis, sem dependência de DOM: a resolução do gesto
// de arraste (segurar → arrastar ↑ → travar) e o estado de duração da
// gravação (aviso não-bloqueante de "gravação longa").

// Quanto o dedo precisa subir, em px, a partir do ponto onde apertou o
// microfone, para a gravação travar (modo mãos-livres).
export const LIMIAR_TRAVAR_PX = 56

// Aos 3 min a barra de gravação fica âmbar e avisa "Gravação longa". Não
// interrompe nada - o teto rígido com auto-salvamento é decisão separada
// (ADR-0021, itens 2 e 3, ainda não implementados).
export const AVISO_GRAVACAO_LONGA_MS = 3 * 60 * 1000

// Toque curto demais (esbarrão no botão) não vira entrada de áudio.
export const DURACAO_MINIMA_MS = 400

// dy = clientY atual − clientY de quando apertou. Dedo subindo => dy < 0.
export function resolverGesto({ dy = 0 } = {}) {
  return -dy >= LIMIAR_TRAVAR_PX ? 'travar' : 'nada'
}

// 0 → 1, para animar o "enchimento" do cadeado no trilho enquanto arrasta.
export function progressoTravar(dy = 0) {
  const p = -dy / LIMIAR_TRAVAR_PX
  if (p <= 0) return 0
  if (p >= 1) return 1
  return p
}

export function estadoDuracao(ms) {
  return ms >= AVISO_GRAVACAO_LONGA_MS ? 'longa' : 'normal'
}

// Relógio da gravação que desconta o tempo pausado (docs/adr/0021). O áudio
// do MediaRecorder já sai contínuo (sem o trecho pausado); aqui é só a
// contagem que precisa somar apenas os segmentos ativos. `agora` é injetável
// pra teste.
export function criarRelogioGravacao(agora = () => Date.now()) {
  let acumuladoMs = 0
  let inicioSegmento = null // null => parado ou pausado

  return {
    iniciar() {
      acumuladoMs = 0
      inicioSegmento = agora()
    },
    pausar() {
      if (inicioSegmento === null) return
      acumuladoMs += agora() - inicioSegmento
      inicioSegmento = null
    },
    retomar() {
      if (inicioSegmento === null) inicioSegmento = agora()
    },
    decorridoMs() {
      return acumuladoMs + (inicioSegmento === null ? 0 : agora() - inicioSegmento)
    }
  }
}

export function formatarCronometro(ms) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeg / 60)
  const s = totalSeg % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
