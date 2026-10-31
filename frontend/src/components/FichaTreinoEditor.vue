<script setup>
import { ref, computed } from 'vue'
import exerciciosService from '../services/exercicios.service.js'
import {
  TIPOS_GRUPO,
  tiposPermitidos,
  ehConjugado,
  itemDoExercicio,
  grupoSimples,
  conjugarComProximo,
  separarGrupo,
  removerItem as removerItemDosGrupos,
  moverGrupo as moverGrupoNaLista,
  moverItem as moverItemNoGrupo,
  definirExercicioDoItem,
  rotuloPosicao
} from '../utils/fichaTreino.js'
import { useToasts } from '../composables/useToasts.js'
import ToastStack from './ToastStack.vue'
import ExercicioMidia from './ExercicioMidia.vue'
import BuscaExercicio from './BuscaExercicio.vue'

// Editor dos grupos de uma ficha (docs/adr/0026) - usado na ficha montada à
// mão (FichaTreinoSecao) e na revisão da ficha ditada (docs/adr/0028,
// RevisaoFichaTreino). Na revisão, um item pode chegar SEM exercício (a IA não
// reconheceu o que foi falado) ou com o exercício errado: o personal escolhe no
// catálogo - podendo salvar o que falou como apelido (docs/adr/0027) - ou
// cadastra um exercício da equipe ali mesmo. Apelido e cadastro usam os
// endpoints de exercício, na hora; não dependem de salvar a ficha.
const props = defineProps({
  grupos: { type: Array, required: true },
  catalogo: { type: Array, required: true }
})
const emit = defineEmits(['update:grupos', 'exercicio-criado'])
const { toasts, showToast } = useToasts()

function atualizar(grupos) {
  emit('update:grupos', grupos)
}

function adicionarExercicio(exercicio) {
  atualizar([...props.grupos, grupoSimples(itemDoExercicio(exercicio))])
}

// ----------------------------------------------------- resolver um item

// chave do item com o painel de troca aberto (itens sem exercício têm o
// painel sempre aberto).
const trocandoChave = ref(null)
const apelidoMarcado = ref({}) // chave -> boolean
const apelidoTexto = ref({}) // chave -> texto editável
const cadastrandoChave = ref(null)
const cadastroNome = ref('')
const cadastroGrupo = ref('')
const ocupado = ref(false)

const gruposMusculares = computed(() =>
  [...new Set(props.catalogo.map((e) => e.grupo_muscular).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
)

function resolvendo(item) {
  return !item.exercicioId || trocandoChave.value === item.chave
}

function abrirTroca(item) {
  trocandoChave.value = item.chave
}

function textoApelido(item) {
  return apelidoTexto.value[item.chave] ?? item.nomeOuvido ?? ''
}

function mensagemDaApi(err, padrao) {
  return err?.response?.data?.error?.message || padrao
}

async function escolher(gi, ii, item, exercicio) {
  atualizar(definirExercicioDoItem(props.grupos, gi, ii, exercicio))
  trocandoChave.value = null
  const texto = textoApelido(item).trim()
  if (!apelidoMarcado.value[item.chave] || !texto) return
  try {
    await exerciciosService.adicionarApelido(exercicio.id, texto)
    showToast(`“${texto}” agora também encontra ${exercicio.nome}.`, 'success')
  } catch (err) {
    // A escolha vale para esta ficha mesmo sem o apelido (ex.: já é de outro exercício).
    showToast(mensagemDaApi(err, 'Não foi possível salvar o apelido.'), 'warning')
  }
}

function abrirCadastro(item) {
  cadastrandoChave.value = item.chave
  const ouvido = (item.nomeOuvido || '').trim()
  cadastroNome.value = ouvido ? ouvido.charAt(0).toUpperCase() + ouvido.slice(1) : ''
  cadastroGrupo.value = ''
}

async function cadastrar(gi, ii) {
  const nome = cadastroNome.value.trim()
  if (!nome) return
  ocupado.value = true
  try {
    const criado = await exerciciosService.criar({ nome, grupoMuscular: cadastroGrupo.value.trim() || null })
    emit('exercicio-criado', criado)
    atualizar(definirExercicioDoItem(props.grupos, gi, ii, criado))
    cadastrandoChave.value = null
    trocandoChave.value = null
    showToast(`${criado.nome} cadastrado no catálogo da equipe.`, 'success')
  } catch (err) {
    showToast(mensagemDaApi(err, 'Não foi possível cadastrar o exercício.'), 'warning')
  } finally {
    ocupado.value = false
  }
}

// ------------------------------------------------------ grupos e itens

function conjugar(indice) {
  atualizar(conjugarComProximo(props.grupos, indice))
}
function separar(indice) {
  atualizar(separarGrupo(props.grupos, indice))
}
function removerItem(indiceGrupo, indiceItem) {
  atualizar(removerItemDosGrupos(props.grupos, indiceGrupo, indiceItem))
}
function moverGrupo(indice, direcao) {
  atualizar(moverGrupoNaLista(props.grupos, indice, direcao))
}
function moverItem(indiceGrupo, indiceItem, direcao) {
  atualizar(moverItemNoGrupo(props.grupos, indiceGrupo, indiceItem, direcao))
}

const ROTULO_CONFIANCA = { media: 'Conferir', baixa: 'Baixa confiança' }
</script>

<template>
  <div>
    <div v-if="!grupos.length" class="empty-state" style="padding: 24px;">Nenhum exercício adicionado ainda.</div>

    <template v-for="(grupo, gi) in grupos" :key="grupo.chave">
      <div :class="ehConjugado(grupo) ? 'grupo-conjugado' : 'exercise-card'">
        <!-- Grupo conjugado: tipo, voltas e descanso entre voltas valem para o grupo todo. -->
        <div v-if="ehConjugado(grupo)" class="field-row">
          <div class="field-group">
            <label>Tipo</label>
            <select v-model="grupo.tipo">
              <option v-for="tipo in tiposPermitidos(grupo.itens.length)" :key="tipo" :value="tipo">{{ TIPOS_GRUPO[tipo] }}</option>
            </select>
          </div>
          <div class="field-group">
            <label>Voltas</label>
            <input v-model="grupo.series" type="number" min="1" />
          </div>
          <div class="field-group">
            <label>Descanso entre voltas</label>
            <input v-model="grupo.descanso" type="text" placeholder="Ex.: 60s" />
          </div>
          <div class="field-group obs-field">
            <label>Observações do grupo</label>
            <input v-model="grupo.observacoes" type="text" placeholder="Ex.: na 2ª volta, 10 repetições no supino" />
          </div>
        </div>

        <div v-for="(item, ii) in grupo.itens" :key="item.chave" :class="{ 'grupo-item-edicao': ehConjugado(grupo) }">
          <div class="exercise-card-top" :style="ehConjugado(grupo) ? 'margin-bottom: 0;' : ''">
            <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
              <span class="posicao" :class="{ 'posicao-pendente': !item.exercicioId }">{{ rotuloPosicao(grupo, gi, ii) }}</span>
              <ExercicioMidia
                v-if="item.exercicioId"
                :exercicio-id="item.exercicioId"
                :tem-inicio="item.temImagemInicio"
                :tem-fim="item.temImagemFim"
                :video-url="item.midiaVideoUrl"
                :instrucoes="item.instrucoes"
                :nome="item.nome"
                :size="ehConjugado(grupo) ? undefined : 'md'"
              />
              <div style="min-width: 0;">
                <div v-if="item.exercicioId" class="exercise-name">
                  {{ item.nome }}
                  <span
                    v-if="ROTULO_CONFIANCA[item.confianca]"
                    class="confidence-note"
                    :class="item.confianca"
                    :title="item.trecho ? `Ouvido: “${item.trecho}”` : ''"
                  >● {{ ROTULO_CONFIANCA[item.confianca] }}</span>
                </div>
                <div v-else class="exercise-name item-pendente">Não reconhecido: “{{ item.nomeOuvido || 'sem nome' }}”</div>
                <div v-if="item.exercicioId && !ehConjugado(grupo)" class="exercise-meta">
                  {{ item.grupoMuscular }}<template v-if="item.nomeOuvido && item.nomeOuvido.toLowerCase() !== item.nome.toLowerCase()"> · falado: “{{ item.nomeOuvido }}”</template>
                </div>
                <div v-if="item.trecho && !item.exercicioId" class="exercise-meta">“{{ item.trecho }}”</div>
              </div>
            </div>
            <div style="display: flex; gap: 4px; align-items: center; flex: none;">
              <template v-if="ehConjugado(grupo)">
                <button type="button" class="btn btn-ghost btn-sm" :disabled="ii === 0" title="Subir no grupo" @click="moverItem(gi, ii, -1)">↑</button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="ii === grupo.itens.length - 1" title="Descer no grupo" @click="moverItem(gi, ii, 1)">↓</button>
              </template>
              <button v-if="item.exercicioId && !resolvendo(item)" type="button" class="btn btn-ghost btn-sm" @click="abrirTroca(item)">Trocar</button>
              <button type="button" class="exercise-remove" @click="removerItem(gi, ii)">Remover</button>
            </div>
          </div>

          <!-- Resolver: escolher no catálogo (com apelido opcional) ou cadastrar. -->
          <div v-if="resolvendo(item)" class="resolver">
            <BuscaExercicio :catalogo="catalogo" @selecionar="(exercicio) => escolher(gi, ii, item, exercicio)" />
            <label v-if="item.nomeOuvido" class="resolver-apelido">
              <input v-model="apelidoMarcado[item.chave]" type="checkbox" />
              <span>Salvar</span>
              <input
                :value="textoApelido(item)"
                type="text"
                maxlength="120"
                aria-label="Apelido a salvar"
                @input="apelidoTexto[item.chave] = $event.target.value"
              />
              <span>como apelido do exercício escolhido</span>
            </label>
            <div v-if="cadastrandoChave === item.chave" class="resolver-cadastro">
              <input v-model="cadastroNome" type="text" placeholder="Nome do exercício" aria-label="Nome do exercício" />
              <input v-model="cadastroGrupo" type="text" list="grupos-musculares" placeholder="Grupo muscular" aria-label="Grupo muscular" />
              <button type="button" class="btn btn-primary btn-sm" :disabled="ocupado || !cadastroNome.trim()" @click="cadastrar(gi, ii)">Cadastrar</button>
              <button type="button" class="btn btn-ghost btn-sm" @click="cadastrandoChave = null">Cancelar</button>
            </div>
            <div class="resolver-acoes">
              <button v-if="cadastrandoChave !== item.chave" type="button" class="btn btn-ghost btn-sm" @click="abrirCadastro(item)">
                + Cadastrar exercício novo
              </button>
              <button v-if="item.exercicioId" type="button" class="btn btn-ghost btn-sm" @click="trocandoChave = null">Manter {{ item.nome }}</button>
            </div>
          </div>

          <!-- Campos do exercício: no simples, séries/descanso são do grupo. -->
          <div v-if="!ehConjugado(grupo)" class="field-row">
            <div class="field-group">
              <label>Séries</label>
              <input v-model="grupo.series" type="number" min="1" />
            </div>
            <div class="field-group">
              <label>Repetições ou tempo</label>
              <input v-model="item.repeticoes" type="text" placeholder="Ex.: 12 ou 30s" />
            </div>
            <div class="field-group">
              <label>Descanso</label>
              <input v-model="grupo.descanso" type="text" placeholder="Ex.: 60s" />
            </div>
            <div class="field-group obs-field">
              <label>Carga / observações</label>
              <input v-model="item.cargaObs" type="text" placeholder="Ex.: 20kg, aumentar progressivamente" />
            </div>
          </div>
          <div v-else class="field-row item-campos">
            <div class="field-group">
              <label>Repetições ou tempo</label>
              <input v-model="item.repeticoes" type="text" placeholder="Ex.: 12 ou 30s" />
            </div>
            <div class="field-group">
              <label>Carga / observações</label>
              <input v-model="item.cargaObs" type="text" placeholder="Ex.: 20kg" />
            </div>
          </div>
        </div>

        <div class="grupo-acoes">
          <button type="button" class="btn btn-ghost btn-sm" :disabled="gi === 0" @click="moverGrupo(gi, -1)">↑ Subir</button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="gi === grupos.length - 1" @click="moverGrupo(gi, 1)">↓ Descer</button>
          <button
            v-if="gi < grupos.length - 1"
            type="button"
            class="btn btn-ghost btn-sm"
            title="Fazer este exercício em sequência com o próximo (bi-set, tri-set, circuito)"
            @click="conjugar(gi)"
          >
            🔗 {{ ehConjugado(grupo) ? 'Incluir o próximo' : 'Conjugar com o próximo' }}
          </button>
          <button v-if="ehConjugado(grupo)" type="button" class="btn btn-ghost btn-sm" @click="separar(gi)">Separar exercícios</button>
        </div>
      </div>
    </template>

    <datalist id="grupos-musculares">
      <option v-for="g in gruposMusculares" :key="g" :value="g"></option>
    </datalist>

    <div class="form-field" style="margin-top: 8px; max-width: 560px;">
      <label>Adicionar exercício do catálogo</label>
      <BuscaExercicio :catalogo="catalogo" @selecionar="adicionarExercicio" />
    </div>
    <p class="list-row-sub" style="margin-top: 8px;">
      Para um bi-set, tri-set ou circuito, adicione os exercícios em sequência e use “Conjugar com o próximo”.
    </p>

    <ToastStack :toasts="toasts" />
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
.posicao-pendente { background: var(--color-warning-light); color: var(--color-warning); }
.item-pendente { color: var(--color-warning); }
.confidence-note { margin-left: 8px; font-size: 11px; }
.grupo-conjugado {
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 4px 18px 14px;
  margin-bottom: 12px;
  background: var(--color-surface);
}
.grupo-item-edicao {
  border-top: 1px dashed var(--color-border);
  margin-top: 12px;
  padding-top: 12px;
}
.item-campos {
  grid-template-columns: 1fr 2fr;
}
.grupo-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.resolver {
  margin: 10px 0 4px;
  padding: 10px 12px;
  border: 1px dashed var(--color-warning);
  border-radius: var(--radius-md);
  background: var(--color-warning-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 620px;
}
.resolver-apelido {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}
.resolver-apelido input[type='text'] {
  width: 200px;
  font-size: 12.5px;
  padding: 3px 8px;
}
.resolver-cadastro {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.resolver-cadastro input { flex: 1; min-width: 150px; font-size: 13px; }
.resolver-acoes { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
