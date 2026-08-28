<script setup>
import { ref, reactive, computed, watch } from 'vue'
import avaliacoesFisicasService from '../../services/avaliacoesFisicas.service.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'
import {
  METODOS_POR_METRICA,
  ehMultiMetodo,
  rotuloMetodo,
  DERIVADAS,
  CATEGORIA_ROTULO,
  CATEGORIA_ORDEM,
  HISTORICO_FAMILIAR_OPCOES,
  ANAMNESE_CAMPOS_TEXTO,
  POSTURAL_SECOES,
  POSTURAL_SECOES_LADO,
  LADOS
} from '../../utils/avaliacaoFisica.js'

const props = defineProps({
  alunoId: { type: String, required: true },
  metricas: { type: Array, required: true },
  avaliacao: { type: Object, default: null }, // null = criar
  // docs/adr/0018 - 'criar' | 'editar' | 'revisao'. Em 'revisao' o form é
  // pré-preenchido por `rascunhoInicial` (proposta da IA) e, ao confirmar,
  // emite `confirmar(payload)` em vez de chamar o service - quem confirma é a
  // tela de revisão (endpoint /confirmar-avaliacao-fisica).
  modo: { type: String, default: null },
  rascunhoInicial: { type: Object, default: null },
  // 'revisao': o pai controla o estado de envio (a confirmação é dele).
  ocupado: { type: Boolean, default: false }
})
const emit = defineEmits(['salvo', 'cancelar', 'confirmar'])

const { toasts, showToast } = useToasts()
const salvando = ref(false)

const modoEfetivo = computed(() => props.modo || (props.avaliacao ? 'editar' : 'criar'))
const editando = computed(() => modoEfetivo.value === 'editar')
const revisao = computed(() => modoEfetivo.value === 'revisao')
const importada = computed(() => props.avaliacao?.origem === 'legado_bodymove')

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

const data = ref(hoje())
const observacoes = ref('')

// medidas de método único: { [codigo]: 'valorString' }
const valores = reactive({})
// medidas multi-método: { percentual_gordura: [{metodo, valor, principal}], vo2max: [...] }
const multi = reactive({ percentual_gordura: [], vo2max: [] })

const metricasSimples = computed(() => {
  const ativas = props.metricas.filter((m) => m.ativo && !DERIVADAS.includes(m.codigo) && !ehMultiMetodo(m.codigo))
  return CATEGORIA_ORDEM.map((cat) => ({
    categoria: cat,
    rotulo: CATEGORIA_ROTULO[cat] || cat,
    metricas: ativas.filter((m) => m.categoria === cat).sort((a, b) => a.ordem - b.ordem)
  })).filter((g) => g.metricas.length)
})

function metricaPorCodigo(codigo) {
  return props.metricas.find((m) => m.codigo === codigo)
}

// --- derivadas ao vivo (só exibição; o backend recalcula na gravação, ver
// backend/src/services/avaliacao-fisica/metricas-derivadas.js) ---
const previewDerivadas = computed(() => {
  const num = (c) => {
    const v = Number(valores[c])
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const out = {}
  const peso = num('peso')
  const altura = num('altura')
  if (peso && altura) out.imc = (peso / (altura / 100) ** 2).toFixed(1)
  const cintura = num('perimetro_cintura')
  const quadril = num('perimetro_quadril')
  if (cintura && quadril) out.rcq = (cintura / quadril).toFixed(2)
  // massa gorda/magra (2 compartimentos) a partir da % de gordura acompanhada
  const linhasGordura = multi.percentual_gordura.filter((r) => Number(r.valor) > 0)
  const gorduraPrincipal = linhasGordura.find((r) => r.principal) || linhasGordura[0]
  const pctGordura = gorduraPrincipal ? Number(gorduraPrincipal.valor) : null
  if (peso && pctGordura > 0) {
    const massaGorda = (peso * pctGordura) / 100
    out.massa_gorda = massaGorda.toFixed(1)
    if (peso - massaGorda > 0) out.massa_magra = (peso - massaGorda).toFixed(1)
  }
  return out
})

// --- anamnese ---
const anamnese = reactive({
  objetivo: '',
  pratica_atividade: '', // '', 'sim', 'nao'
  atividade_tipo: '',
  atividade_frequencia_semanal: '',
  restricoes: '',
  medicamentos: '',
  dores_queixas: '',
  cirurgias_lesoes: '',
  consumo_alcool: '',
  dieta_orientacao: '',
  alergias: '',
  observacoes: '',
  tabagismo_fuma: false,
  tabagismo_cigarros_dia: '',
  tabagismo_tempo: '',
  historico_familiar: []
})

// --- postural (todas as folhas boolean) ---
const postural = reactive({})
const posturalObs = ref('')
function zerarPostural() {
  for (const secao of POSTURAL_SECOES) {
    postural[secao.regiao] = {}
    for (const [chave] of secao.achados) postural[secao.regiao][chave] = false
  }
  for (const secao of POSTURAL_SECOES_LADO) {
    postural[secao.regiao] = {}
    for (const [lado] of LADOS) {
      postural[secao.regiao][lado] = {}
      for (const [chave] of secao.achados) postural[secao.regiao][lado][chave] = false
    }
  }
}

function resetar() {
  zerarPostural()
  for (const codigo of Object.keys(valores)) delete valores[codigo]
  multi.percentual_gordura = []
  multi.vo2max = []
  observacoes.value = ''
  posturalObs.value = ''
  Object.assign(anamnese, {
    objetivo: '',
    pratica_atividade: '',
    atividade_tipo: '',
    atividade_frequencia_semanal: '',
    restricoes: '',
    medicamentos: '',
    dores_queixas: '',
    cirurgias_lesoes: '',
    consumo_alcool: '',
    dieta_orientacao: '',
    alergias: '',
    observacoes: '',
    tabagismo_fuma: false,
    tabagismo_cigarros_dia: '',
    tabagismo_tempo: '',
    historico_familiar: []
  })
}

function hidratar() {
  resetar()
  // docs/adr/0018 - em 'revisao' a fonte é o rascunho da IA (sem anamnese/
  // postural); nos demais modos é a avaliação existente (ou nada, em 'criar').
  const av = revisao.value ? props.rascunhoInicial : props.avaliacao
  if (!av) {
    data.value = hoje()
    return
  }
  data.value = av.data ? String(av.data).slice(0, 10) : hoje()
  observacoes.value = av.observacoes || ''

  for (const m of av.medidas || []) {
    if (DERIVADAS.includes(m.metrica_codigo)) continue
    if (ehMultiMetodo(m.metrica_codigo)) {
      multi[m.metrica_codigo].push({ metodo: m.metodo, valor: String(m.valor), principal: Boolean(m.principal) })
    } else {
      valores[m.metrica_codigo] = String(m.valor)
    }
  }

  const a = av.anamnese_json || {}
  anamnese.objetivo = a.objetivo || ''
  if (a.pratica_atividade === true) anamnese.pratica_atividade = 'sim'
  else if (a.pratica_atividade === false) anamnese.pratica_atividade = 'nao'
  else anamnese.pratica_atividade = ''
  anamnese.atividade_tipo = a.atividade_tipo || ''
  anamnese.atividade_frequencia_semanal = a.atividade_frequencia_semanal ?? ''
  for (const campo of ANAMNESE_CAMPOS_TEXTO) anamnese[campo.chave] = a[campo.chave] || ''
  anamnese.tabagismo_fuma = Boolean(a.tabagismo?.fuma)
  anamnese.tabagismo_cigarros_dia = a.tabagismo?.cigarros_dia ?? ''
  anamnese.tabagismo_tempo = a.tabagismo?.tempo || ''
  anamnese.historico_familiar = Array.isArray(a.historico_familiar) ? [...a.historico_familiar] : []

  const p = av.postural_json || {}
  for (const secao of POSTURAL_SECOES) {
    for (const [chave] of secao.achados) postural[secao.regiao][chave] = Boolean(p[secao.regiao]?.[chave])
  }
  for (const secao of POSTURAL_SECOES_LADO) {
    for (const [lado] of LADOS) {
      for (const [chave] of secao.achados) postural[secao.regiao][lado][chave] = Boolean(p[secao.regiao]?.[lado]?.[chave])
    }
  }
  posturalObs.value = p.observacoes || ''
}

// Síncrono no setup - o template lê `postural[regiao][...]` já no primeiro
// render, então a estrutura precisa existir antes de montar.
hidratar()
watch([() => props.avaliacao, () => props.rascunhoInicial], hidratar)

function metodosDisponiveis(codigo, jaUsados) {
  return METODOS_POR_METRICA[codigo].filter((m) => !jaUsados.includes(m))
}
function adicionarMetodo(codigo) {
  const usados = multi[codigo].map((r) => r.metodo)
  const disp = metodosDisponiveis(codigo, usados)
  if (!disp.length) return
  multi[codigo].push({ metodo: disp[0], valor: '', principal: multi[codigo].length === 0 })
}
function removerMetodo(codigo, i) {
  const eraPrincipal = multi[codigo][i].principal
  multi[codigo].splice(i, 1)
  if (eraPrincipal && multi[codigo].length) multi[codigo][0].principal = true
}
function marcarPrincipal(codigo, i) {
  multi[codigo].forEach((r, idx) => (r.principal = idx === i))
}

function montarPayload() {
  const medidas = []
  for (const [codigo, val] of Object.entries(valores)) {
    const n = Number(val)
    if (val !== '' && Number.isFinite(n) && n > 0) medidas.push({ metrica_codigo: codigo, valor: n })
  }
  for (const codigo of Object.keys(METODOS_POR_METRICA)) {
    const linhas = multi[codigo].filter((r) => r.valor !== '' && Number(r.valor) > 0)
    if (linhas.length && !linhas.some((r) => r.principal)) linhas[0].principal = true
    for (const r of linhas) {
      medidas.push({ metrica_codigo: codigo, metodo: r.metodo, valor: Number(r.valor), principal: Boolean(r.principal) })
    }
  }

  const anamneseJson = {}
  if (anamnese.objetivo.trim()) anamneseJson.objetivo = anamnese.objetivo.trim()
  if (anamnese.pratica_atividade) anamneseJson.pratica_atividade = anamnese.pratica_atividade === 'sim'
  if (anamnese.atividade_tipo.trim()) anamneseJson.atividade_tipo = anamnese.atividade_tipo.trim()
  const freq = Number.parseInt(anamnese.atividade_frequencia_semanal, 10)
  if (Number.isInteger(freq) && freq >= 0) anamneseJson.atividade_frequencia_semanal = freq
  for (const campo of ANAMNESE_CAMPOS_TEXTO) {
    const v = String(anamnese[campo.chave] || '').trim()
    if (v) anamneseJson[campo.chave] = v
  }
  if (anamnese.tabagismo_fuma) {
    anamneseJson.tabagismo = { fuma: true }
    const cig = Number.parseInt(anamnese.tabagismo_cigarros_dia, 10)
    if (Number.isInteger(cig) && cig > 0) anamneseJson.tabagismo.cigarros_dia = cig
    if (anamnese.tabagismo_tempo.trim()) anamneseJson.tabagismo.tempo = anamnese.tabagismo_tempo.trim()
  }
  if (anamnese.historico_familiar.length) anamneseJson.historico_familiar = [...anamnese.historico_familiar]

  const posturalJson = {}
  for (const secao of POSTURAL_SECOES) {
    const achados = {}
    for (const [chave] of secao.achados) if (postural[secao.regiao][chave]) achados[chave] = true
    if (Object.keys(achados).length) posturalJson[secao.regiao] = achados
  }
  for (const secao of POSTURAL_SECOES_LADO) {
    const sub = {}
    for (const [lado] of LADOS) {
      const achados = {}
      for (const [chave] of secao.achados) if (postural[secao.regiao][lado][chave]) achados[chave] = true
      if (Object.keys(achados).length) sub[lado] = achados
    }
    if (Object.keys(sub).length) posturalJson[secao.regiao] = sub
  }
  if (posturalObs.value.trim()) posturalJson.observacoes = posturalObs.value.trim()

  return {
    data: data.value,
    observacoes: observacoes.value.trim() || null,
    anamnese_json: Object.keys(anamneseJson).length ? anamneseJson : null,
    postural_json: Object.keys(posturalJson).length ? posturalJson : null,
    medidas
  }
}

async function salvar() {
  if (!data.value) {
    showToast('Informe a data da avaliação.', 'warning')
    return
  }
  const payload = montarPayload()

  // docs/adr/0018 - em 'revisao' quem persiste é a tela de revisão, pelo
  // endpoint /confirmar-avaliacao-fisica (não o CRUD direto).
  if (revisao.value) {
    emit('confirmar', payload)
    return
  }

  salvando.value = true
  try {
    const salvo = editando.value
      ? await avaliacoesFisicasService.atualizar(props.alunoId, props.avaliacao.id, payload)
      : await avaliacoesFisicasService.criar(props.alunoId, payload)
    showToast(editando.value ? 'Avaliação atualizada.' : 'Avaliação criada.', 'success')
    emit('salvo', salvo)
  } catch (err) {
    showToast(err.response?.data?.error?.message || 'Não foi possível salvar a avaliação.', 'warning')
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <form @submit.prevent="salvar">
    <div v-if="!revisao" class="view-header">
      <div>
        <h1>{{ editando ? 'Editar avaliação' : 'Nova avaliação física' }}</h1>
        <p v-if="importada"><span class="badge badge-neutral">Importada do BodyMove — origem preservada</span></p>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom: 16px;">
      <div class="field-row" style="grid-template-columns: 200px 1fr;">
        <div class="field-group">
          <label>Data da avaliação *</label>
          <input v-model="data" type="date" required />
        </div>
        <div class="field-group">
          <label>Observações</label>
          <input v-model="observacoes" type="text" placeholder="Contexto geral da avaliação" />
        </div>
      </div>
    </div>

    <!-- medidas de método único, por categoria -->
    <div v-for="grupo in metricasSimples" :key="grupo.categoria" class="card card-pad" style="margin-bottom: 16px;">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 10px;">{{ grupo.rotulo }}</div>
      <div class="af-grid">
        <div v-for="m in grupo.metricas" :key="m.codigo" class="field-group">
          <label>{{ m.rotulo }} <span class="af-unidade">({{ m.unidade }})</span></label>
          <input v-model="valores[m.codigo]" type="number" step="any" min="0" inputmode="decimal" />
        </div>
      </div>
    </div>

    <!-- % de gordura e VO2: multi-método -->
    <div v-for="codigo in ['percentual_gordura', 'vo2max']" :key="codigo" class="card card-pad" style="margin-bottom: 16px;">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 4px;">
        {{ metricaPorCodigo(codigo)?.rotulo }} <span class="af-unidade">({{ metricaPorCodigo(codigo)?.unidade }})</span>
      </div>
      <p class="list-row-sub" style="margin-bottom: 10px;">
        Pode registrar mais de um protocolo. Marque qual é o valor acompanhado.
      </p>
      <div v-for="(linha, i) in multi[codigo]" :key="i" class="af-metodo-linha">
        <label class="af-principal">
          <input type="radio" :name="`principal-${codigo}`" :checked="linha.principal" @change="marcarPrincipal(codigo, i)" />
          acompanhado
        </label>
        <select v-model="linha.metodo">
          <option v-for="met in METODOS_POR_METRICA[codigo]" :key="met" :value="met">{{ rotuloMetodo(met) }}</option>
        </select>
        <input v-model="linha.valor" type="number" step="any" min="0" inputmode="decimal" placeholder="valor" />
        <button type="button" class="btn btn-ghost btn-sm" @click="removerMetodo(codigo, i)">Remover</button>
      </div>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        :disabled="multi[codigo].length >= METODOS_POR_METRICA[codigo].length"
        @click="adicionarMetodo(codigo)"
      >
        + Adicionar protocolo
      </button>
    </div>

    <!-- valores calculados pelo sistema (nunca editáveis) -->
    <div class="card card-pad" style="margin-bottom: 16px;">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 4px;">Calculado automaticamente</div>
      <p class="list-row-sub">
        IMC {{ previewDerivadas.imc || '—' }} · RCQ {{ previewDerivadas.rcq || '—' }}
        · Massa gorda {{ previewDerivadas.massa_gorda ? previewDerivadas.massa_gorda + ' kg' : '—' }}
        · Massa magra {{ previewDerivadas.massa_magra ? previewDerivadas.massa_magra + ' kg' : '—' }}
        <span class="af-unidade"> (a partir de peso/altura, cintura/quadril e da % de gordura acompanhada)</span>
      </p>
    </div>

    <!-- anamnese -->
    <details class="card card-pad" style="margin-bottom: 16px;" open>
      <summary style="font-size: 15px; font-weight: 700; cursor: pointer;">Anamnese</summary>
      <div style="margin-top: 12px;">
        <div class="field-row" style="grid-template-columns: 160px 200px;">
          <div class="field-group">
            <label>Pratica atividade</label>
            <select v-model="anamnese.pratica_atividade">
              <option value="">—</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </div>
          <div class="field-group">
            <label>Frequência semanal</label>
            <input v-model="anamnese.atividade_frequencia_semanal" type="number" min="0" max="14" />
          </div>
        </div>
        <div class="field-group" style="margin-top: 10px;">
          <label>Tipo de atividade</label>
          <input v-model="anamnese.atividade_tipo" type="text" placeholder="Ex.: musculação + spinning" />
        </div>
        <div v-for="campo in ANAMNESE_CAMPOS_TEXTO.filter((c) => c.chave !== 'atividade_tipo')" :key="campo.chave" class="field-group" style="margin-top: 10px;">
          <label>{{ campo.rotulo }}</label>
          <textarea v-if="campo.tipo === 'textarea'" v-model="anamnese[campo.chave]" rows="2"></textarea>
          <input v-else v-model="anamnese[campo.chave]" type="text" />
        </div>

        <div class="field-group" style="margin-top: 12px;">
          <label><input v-model="anamnese.tabagismo_fuma" type="checkbox" /> Fumante</label>
        </div>
        <div v-if="anamnese.tabagismo_fuma" class="field-row" style="grid-template-columns: 160px 1fr;">
          <div class="field-group">
            <label>Cigarros/dia</label>
            <input v-model="anamnese.tabagismo_cigarros_dia" type="number" min="0" />
          </div>
          <div class="field-group">
            <label>Há quanto tempo</label>
            <input v-model="anamnese.tabagismo_tempo" type="text" placeholder="Ex.: 10 anos" />
          </div>
        </div>

        <div class="field-group" style="margin-top: 12px;">
          <label>Histórico familiar</label>
          <div class="af-chips">
            <label v-for="opt in HISTORICO_FAMILIAR_OPCOES" :key="opt">
              <input v-model="anamnese.historico_familiar" type="checkbox" :value="opt" /> {{ opt }}
            </label>
          </div>
        </div>
      </div>
    </details>

    <!-- postural -->
    <details class="card card-pad" style="margin-bottom: 16px;">
      <summary style="font-size: 15px; font-weight: 700; cursor: pointer;">Avaliação postural</summary>
      <div style="margin-top: 12px;">
        <div v-for="secao in POSTURAL_SECOES" :key="secao.regiao" style="margin-bottom: 12px;">
          <div class="af-postural-titulo">{{ secao.rotulo }}</div>
          <div class="af-chips">
            <label v-for="[chave, rotulo] in secao.achados" :key="chave">
              <input v-model="postural[secao.regiao][chave]" type="checkbox" /> {{ rotulo }}
            </label>
          </div>
        </div>
        <div v-for="secao in POSTURAL_SECOES_LADO" :key="secao.regiao" style="margin-bottom: 12px;">
          <div class="af-postural-titulo">{{ secao.rotulo }}</div>
          <div v-for="[lado, rotuloLado] in LADOS" :key="lado" style="margin-bottom: 6px;">
            <span class="list-row-sub">{{ rotuloLado }}:</span>
            <div class="af-chips">
              <label v-for="[chave, rotulo] in secao.achados" :key="chave">
                <input v-model="postural[secao.regiao][lado][chave]" type="checkbox" /> {{ rotulo }}
              </label>
            </div>
          </div>
        </div>
        <div class="field-group" style="margin-top: 8px;">
          <label>Observações posturais</label>
          <textarea v-model="posturalObs" rows="2"></textarea>
        </div>
      </div>
    </details>

    <div class="revisao-actions">
      <button type="button" class="btn btn-ghost" @click="emit('cancelar')">Cancelar</button>
      <button type="submit" class="btn btn-primary" :disabled="salvando || ocupado || !data">
        {{ revisao ? 'Confirmar avaliação física' : editando ? 'Salvar alterações' : 'Criar avaliação' }}
      </button>
    </div>

    <ToastStack :toasts="toasts" />
  </form>
</template>

<style scoped>
.af-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.af-unidade { font-weight: 400; color: var(--color-text-faint, #888); font-size: 12px; }
.af-metodo-linha { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.af-metodo-linha select { min-width: 200px; }
.af-metodo-linha input[type='number'] { max-width: 110px; }
.af-principal { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; white-space: nowrap; }
.af-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.af-chips label { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; }
.af-postural-titulo { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
</style>
