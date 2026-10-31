<script setup>
import ExercicioMidia from './ExercicioMidia.vue'
import { ehConjugado, resumoSimples, resumoConjugado, rotuloPosicao, rotuloRepeticoes } from '../utils/fichaTreino.js'

// Leitura dos grupos de uma ficha na tela do personal (docs/adr/0026):
// exercício simples como sempre foi; bi-set/tri-set/circuito numa moldura com
// voltas e descanso, exercícios numerados 2A, 2B...
defineProps({ grupos: { type: Array, required: true } })
</script>

<template>
  <div>
    <template v-for="(grupo, gi) in grupos" :key="grupo.id">
      <div v-if="!ehConjugado(grupo)" class="exercise-card">
        <div class="exercise-card-top">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="posicao">{{ rotuloPosicao(grupo, gi, 0) }}</span>
            <ExercicioMidia
              :exercicio-id="grupo.itens[0].exercicio.id"
              :tem-inicio="Boolean(grupo.itens[0].exercicio.midia_imagem_inicio_caminho)"
              :tem-fim="Boolean(grupo.itens[0].exercicio.midia_imagem_fim_caminho)"
              :video-url="grupo.itens[0].exercicio.midia_video_url"
              :instrucoes="grupo.itens[0].exercicio.instrucoes"
              :nome="grupo.itens[0].exercicio.nome"
              size="md"
            />
            <div>
              <div class="exercise-name">{{ grupo.itens[0].exercicio.nome }}</div>
              <div class="exercise-meta">
                {{ [resumoSimples(grupo, grupo.itens[0]), grupo.itens[0].exercicio.grupo_muscular].filter(Boolean).join(' · ') }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="grupo.itens[0].carga_obs" class="exercise-obs">Carga / observações: {{ grupo.itens[0].carga_obs }}</div>
      </div>

      <div v-else class="grupo-conjugado">
        <div class="grupo-conjugado-cabecalho">
          <span class="grupo-selo">{{ resumoConjugado(grupo) }}</span>
        </div>
        <div v-if="grupo.observacoes" class="grupo-obs">{{ grupo.observacoes }}</div>
        <div v-for="(item, ii) in grupo.itens" :key="item.id" class="grupo-item">
          <span class="posicao">{{ rotuloPosicao(grupo, gi, ii) }}</span>
          <ExercicioMidia
            :exercicio-id="item.exercicio.id"
            :tem-inicio="Boolean(item.exercicio.midia_imagem_inicio_caminho)"
            :tem-fim="Boolean(item.exercicio.midia_imagem_fim_caminho)"
            :video-url="item.exercicio.midia_video_url"
            :instrucoes="item.exercicio.instrucoes"
            :nome="item.exercicio.nome"
            size="md"
          />
          <div style="min-width: 0;">
            <div class="exercise-name">{{ item.exercicio.nome }}</div>
            <div class="exercise-meta">
              {{ [rotuloRepeticoes(item.repeticoes), item.exercicio.grupo_muscular].filter(Boolean).join(' · ') }}
            </div>
            <div v-if="item.carga_obs" class="exercise-obs">Carga / observações: {{ item.carga_obs }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.posicao {
  flex: none;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.grupo-conjugado {
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  margin-bottom: 12px;
  background: var(--color-surface);
}
.grupo-conjugado-cabecalho {
  margin-bottom: 8px;
}
.grupo-selo {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary-dark);
  background: var(--color-primary-light);
  border-radius: var(--radius-full);
  padding: 3px 10px;
}
.grupo-obs {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  margin-bottom: 6px;
}
.grupo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}
.grupo-item + .grupo-item {
  border-top: 1px dashed var(--color-border);
}
</style>
