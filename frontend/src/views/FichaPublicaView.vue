<script setup>
import { ref, onMounted } from 'vue'
import fichaPublicaService from '../services/fichaPublica.service.js'
import ExercicioMidia from '../components/ExercicioMidia.vue'

// docs/adr/0014-acesso-aluno-ficha-por-link.md: tela PÚBLICA do aluno.
// Somente leitura, sem login, layout próprio (fora do AdminShell). O token
// vem do path; nenhum id de aluno/ficha é conhecido pelo cliente.
const props = defineProps({ token: { type: String, required: true } })

const carregando = ref(true)
const erro = ref(null) // { titulo, mensagem }
const aluno = ref(null)
const ficha = ref(null)

function carregarImagemDoItem(exercicioId) {
  return (posicao) => fichaPublicaService.obterImagem(props.token, exercicioId, posicao)
}

function metaItem(item) {
  const partes = []
  if (item.series) partes.push(`${item.series} série(s)`)
  if (item.repeticoes) partes.push(`${item.repeticoes} repetições`)
  if (item.exercicio.grupoMuscular) partes.push(item.exercicio.grupoMuscular)
  return partes.join(' · ')
}

function formatarData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

onMounted(async () => {
  try {
    const dados = await fichaPublicaService.obterFicha(props.token)
    aluno.value = dados.aluno
    ficha.value = dados.ficha
  } catch (e) {
    const status = e.response?.status
    const mensagemApi = e.response?.data?.error?.message
    if (status === 410) {
      erro.value = { titulo: 'Link expirado ou revogado', mensagem: mensagemApi || 'Solicite um novo link ao seu personal.' }
    } else if (status === 404) {
      erro.value = { titulo: 'Link inválido', mensagem: 'Confira o endereço ou solicite um novo link ao seu personal.' }
    } else {
      erro.value = { titulo: 'Não foi possível carregar a ficha', mensagem: 'Verifique sua conexão e tente novamente.' }
    }
  } finally {
    carregando.value = false
  }
})
</script>

<template>
  <div class="ficha-publica">
    <div class="fp-container">
      <div v-if="carregando" class="fp-estado">Carregando ficha…</div>

      <div v-else-if="erro" class="fp-card fp-erro">
        <div class="fp-erro-icon">🔒</div>
        <h1>{{ erro.titulo }}</h1>
        <p>{{ erro.mensagem }}</p>
      </div>

      <template v-else>
        <header class="fp-header">
          <div class="fp-eyebrow">Ficha de treino</div>
          <h1>{{ aluno?.nome }}</h1>
        </header>

        <div v-if="!ficha" class="fp-card fp-vazio">
          <div class="fp-erro-icon">📋</div>
          <p>Seu personal ainda não publicou uma ficha de treino para você.</p>
        </div>

        <template v-else>
          <div class="fp-card fp-resumo">
            <div class="fp-resumo-nome">{{ ficha.nome || 'Ficha de treino' }}</div>
            <div v-if="ficha.atualizadaEm" class="fp-resumo-data">Atualizada em {{ formatarData(ficha.atualizadaEm) }}</div>
            <p v-if="ficha.observacoes" class="fp-obs">{{ ficha.observacoes }}</p>
          </div>

          <ol class="fp-lista">
            <li v-for="(item, indice) in ficha.itens" :key="item.exercicio.id" class="fp-card fp-item">
              <div class="fp-item-top">
                <span class="fp-num">{{ indice + 1 }}</span>
                <ExercicioMidia
                  :exercicio-id="item.exercicio.id"
                  :tem-inicio="item.exercicio.temImagemInicio"
                  :tem-fim="item.exercicio.temImagemFim"
                  :video-url="item.exercicio.videoUrl"
                  :instrucoes="item.exercicio.instrucoes"
                  :nome="item.exercicio.nome"
                  :carregar-imagem="carregarImagemDoItem(item.exercicio.id)"
                  size="md"
                />
                <div class="fp-item-id">
                  <div class="fp-item-nome">{{ item.exercicio.nome }}</div>
                  <div class="fp-item-meta">{{ metaItem(item) }}</div>
                </div>
              </div>
              <div v-if="item.cargaObs" class="fp-carga">Carga / observações: {{ item.cargaObs }}</div>
            </li>
          </ol>
        </template>

        <footer class="fp-footer">
          Este é um link pessoal e temporário. Se ele parar de funcionar, peça um novo ao seu personal.
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ficha-publica {
  min-height: 100%;
  background: var(--color-bg);
  padding: 20px 16px 48px;
}
.fp-container { max-width: 560px; margin: 0 auto; }
.fp-estado { text-align: center; color: var(--color-text-secondary); padding: 60px 0; }

.fp-header { padding: 12px 4px 18px; }
.fp-eyebrow {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: var(--color-primary);
}
.fp-header h1 { font-size: 24px; font-weight: 800; margin-top: 4px; color: var(--color-text); }

.fp-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  margin-bottom: 14px;
}

.fp-resumo-nome { font-size: 16px; font-weight: 700; }
.fp-resumo-data { font-size: 12px; color: var(--color-text-faint); margin-top: 2px; }
.fp-obs {
  margin-top: 10px; font-size: 14px; color: var(--color-text-secondary);
  white-space: pre-wrap; line-height: 1.5;
}

.fp-lista { display: flex; flex-direction: column; }
.fp-item-top { display: flex; align-items: center; gap: 12px; }
.fp-num {
  flex: none; width: 26px; height: 26px; border-radius: var(--radius-full);
  background: var(--color-primary-light); color: var(--color-primary-dark);
  font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.fp-item-id { min-width: 0; }
.fp-item-nome { font-size: 15px; font-weight: 700; }
.fp-item-meta { font-size: 13px; color: var(--color-text-secondary); margin-top: 2px; }
.fp-carga {
  margin-top: 10px; font-size: 13px; color: var(--color-text-secondary);
  border-top: 1px dashed var(--color-border); padding-top: 8px;
}

.fp-erro, .fp-vazio { text-align: center; padding: 36px 20px; }
.fp-erro-icon { font-size: 34px; margin-bottom: 10px; }
.fp-erro h1 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
.fp-erro p, .fp-vazio p { color: var(--color-text-secondary); font-size: 14px; line-height: 1.5; }

.fp-footer {
  margin-top: 18px; text-align: center; font-size: 12px;
  color: var(--color-text-faint); line-height: 1.5; padding: 0 12px;
}
</style>
