<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import exerciciosService from '../services/exercicios.service.js'

const props = defineProps({
  exercicioId: { type: String, required: true },
  temInicio: { type: Boolean, default: false },
  temFim: { type: Boolean, default: false },
  videoUrl: { type: String, default: null },
  instrucoes: { type: String, default: null },
  nome: { type: String, default: '' },
  size: { type: String, default: 'sm' } // sm | md
})

// Duas imagens por exercício (posição inicial/final do movimento, mesmo
// padrão do free-exercise-db) - cada uma buscada como Blob sob demanda
// (endpoint autenticado, mesmo critério de foto de aluno) e só uma vez,
// cacheada aqui enquanto o componente existir.
const urls = ref({ inicio: null, fim: null })
const carregando = ref({ inicio: false, fim: false })
const erro = ref({ inicio: false, fim: false })

const temAlgumaImagem = computed(() => props.temInicio || props.temFim)
// Abre o lightbox também quando não há foto mas há instruções cadastradas -
// a descrição sozinha já vale a pena mostrar (ex.: exercícios sem
// equivalente no catálogo de imagens, mas com instrução escrita).
const podeAbrirLightbox = computed(() => temAlgumaImagem.value || Boolean(props.instrucoes))
const thumbPosicao = computed(() => {
  if (props.temInicio) return 'inicio'
  if (props.temFim) return 'fim'
  return null
})

async function carregarPosicao(posicao) {
  if (!posicao || urls.value[posicao] || carregando.value[posicao]) return
  carregando.value[posicao] = true
  try {
    const blob = await exerciciosService.obterImagem(props.exercicioId, posicao)
    urls.value[posicao] = URL.createObjectURL(blob)
  } catch (_err) {
    erro.value[posicao] = true
  } finally {
    carregando.value[posicao] = false
  }
}

watch(
  () => [props.exercicioId, thumbPosicao.value],
  () => carregarPosicao(thumbPosicao.value),
  { immediate: true }
)

function revogarTudo() {
  Object.values(urls.value).forEach((url) => url && URL.revokeObjectURL(url))
}
onBeforeUnmount(revogarTudo)

const lightboxAberto = ref(false)
const posicaoNoLightbox = ref('inicio')

function abrirLightbox() {
  if (!podeAbrirLightbox.value) return
  posicaoNoLightbox.value = thumbPosicao.value
  carregarPosicao('inicio')
  carregarPosicao('fim')
  lightboxAberto.value = true
}

function alternarPosicao(posicao) {
  posicaoNoLightbox.value = posicao
  carregarPosicao(posicao)
}
</script>

<template>
  <div class="exercicio-midia" :class="`sz-${size}`">
    <button
      type="button"
      class="exercicio-midia-thumb-btn"
      :class="{ 'no-click': !podeAbrirLightbox }"
      :title="podeAbrirLightbox ? 'Ver imagem e instruções' : nome"
      @click="abrirLightbox"
    >
      <img v-if="thumbPosicao && urls[thumbPosicao] && !erro[thumbPosicao]" :src="urls[thumbPosicao]" :alt="nome" class="exercicio-midia-img" />
      <span v-else class="exercicio-midia-placeholder" aria-hidden="true">🏋️</span>
    </button>
    <a v-if="videoUrl" :href="videoUrl" target="_blank" rel="noopener noreferrer" class="exercicio-midia-video" title="Assistir vídeo" @click.stop>🎥</a>

    <Teleport to="body">
      <div v-if="lightboxAberto" class="sheet-overlay open" style="position: fixed; z-index: 200;" @click.self="lightboxAberto = false">
        <div class="lightbox-card" @click.stop>
          <div class="lightbox-head">
            <span class="lightbox-title">{{ nome }}</span>
            <button type="button" class="lightbox-close" title="Fechar" @click="lightboxAberto = false">✕</button>
          </div>
          <div v-if="temAlgumaImagem" class="lightbox-body">
            <img
              v-if="urls[posicaoNoLightbox] && !erro[posicaoNoLightbox]"
              :src="urls[posicaoNoLightbox]"
              :alt="`${nome} - ${posicaoNoLightbox === 'inicio' ? 'posição inicial' : 'posição final'}`"
              class="lightbox-img"
            />
            <div v-else class="empty-state" style="padding: 40px;">Imagem indisponível.</div>
          </div>
          <div v-if="temInicio && temFim" class="lightbox-toggle">
            <button type="button" class="filter-tab" :class="{ active: posicaoNoLightbox === 'inicio' }" @click="alternarPosicao('inicio')">Posição inicial</button>
            <button type="button" class="filter-tab" :class="{ active: posicaoNoLightbox === 'fim' }" @click="alternarPosicao('fim')">Posição final</button>
          </div>
          <div v-if="instrucoes" class="lightbox-instrucoes-label">Instruções</div>
          <p v-if="instrucoes" class="lightbox-instrucoes">{{ instrucoes }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
