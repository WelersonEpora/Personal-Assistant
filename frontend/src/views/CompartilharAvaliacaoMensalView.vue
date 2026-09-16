<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import alunosService from '../services/alunos.service.js'
import avaliacoesMensaisService from '../services/avaliacoesMensais.service.js'
import compartilhadaService from '../services/avaliacaoMensalCompartilhada.service.js'
import { useAuthStore } from '../stores/auth.store.js'
import { useToasts } from '../composables/useToasts.js'
import { listarItensExcluiveis, filtrarAvaliacaoParaAluno } from '../utils/avaliacaoMensalCompartilhada.js'
import ToastStack from '../components/ToastStack.vue'

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md: tela de
// preparação do PDF. Fora do AdminShell para o print sair limpo (@media print
// esconde tudo menos o documento). O personal escreve um comentário, escolhe
// quais itens da avaliação mostrar e gera o PDF pelo "salvar como PDF" do
// navegador. O comentário entra no próximo ciclo mensal como insumo de peso alto.
const props = defineProps({
  id: { type: String, required: true },
  anoMes: { type: String, required: true }
})

const router = useRouter()
const auth = useAuthStore()
const { toasts, showToast } = useToasts()

const carregando = ref(true)
const erro = ref(null) // { titulo, mensagem }
const salvando = ref(false)

const aluno = ref(null)
const avaliacao = ref(null)
const revisao = ref(null)
const desatualizada = ref(false)

const comentario = ref('')
const excluidos = ref(new Set())

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
const rotuloMes = computed(() => {
  const [ano, mes] = String(props.anoMes).split('-')
  return `${NOMES_MES[Number(mes) - 1]} de ${ano}`
})

function formatarData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const hoje = computed(() => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }))

const itensExcluiveis = computed(() => listarItensExcluiveis(avaliacao.value?.avaliacao_json))
const grupos = computed(() => {
  const g = { dimensao: [], destaque: [], recomendacao: [] }
  for (const item of itensExcluiveis.value) g[item.secao].push(item)
  return g
})
const TITULO_GRUPO = { dimensao: 'Evolução por dimensão', destaque: 'Destaques', recomendacao: 'Recomendações' }

const documento = computed(() =>
  filtrarAvaliacaoParaAluno(avaliacao.value?.avaliacao_json, [...excluidos.value])
)

function incluido(chave) {
  return !excluidos.value.has(chave)
}
function alternar(chave) {
  const s = new Set(excluidos.value)
  if (s.has(chave)) s.delete(chave)
  else s.add(chave)
  excluidos.value = s
}

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const [dadosAluno, dadosAvaliacao] = await Promise.all([
      alunosService.obter(props.id),
      avaliacoesMensaisService.obter(props.id, props.anoMes)
    ])
    aluno.value = dadosAluno
    avaliacao.value = dadosAvaliacao

    if (dadosAvaliacao.status !== 'gerada') {
      erro.value = {
        titulo: 'Esta avaliação ainda não pode ser compartilhada',
        mensagem:
          dadosAvaliacao.status === 'dados_insuficientes'
            ? 'O mês foi fechado com dados insuficientes — não há avaliação para enviar ao aluno.'
            : 'A IA não conseguiu gerar esta avaliação. Tente reprocessar antes de compartilhar.'
      }
      return
    }

    const compart = await compartilhadaService.obter(props.id, props.anoMes)
    revisao.value = compart.revisao
    desatualizada.value = compart.desatualizada
    comentario.value = compart.revisao?.comentario || ''
    excluidos.value = new Set(compart.revisao?.itens_excluidos || [])
  } catch (e) {
    const status = e.response?.status
    if (status === 404) {
      erro.value = { titulo: 'Avaliação não encontrada', mensagem: 'Volte ao acompanhamento do aluno e tente de novo.' }
    } else {
      erro.value = { titulo: 'Não foi possível carregar', mensagem: 'Verifique a conexão e tente novamente.' }
    }
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

async function salvar({ silencioso = false } = {}) {
  if (!comentario.value.trim()) {
    showToast('Escreva um comentário para o aluno antes de salvar.', 'warning')
    return false
  }
  salvando.value = true
  try {
    const resultado = await compartilhadaService.salvar(props.id, props.anoMes, {
      comentario: comentario.value.trim(),
      itensExcluidos: [...excluidos.value]
    })
    revisao.value = resultado.revisao
    desatualizada.value = false
    if (!silencioso) showToast('Revisão salva.', 'success')
    return true
  } catch (e) {
    showToast(e.response?.data?.error?.message || 'Não foi possível salvar a revisão.', 'warning')
    return false
  } finally {
    salvando.value = false
  }
}

async function gerarPdf() {
  const ok = await salvar({ silencioso: true })
  if (!ok) return
  // Deixa o Vue aplicar o estado salvo antes de abrir o diálogo de impressão.
  await new Promise((r) => setTimeout(r, 50))
  window.print()
}

function voltar() {
  router.push({ name: 'admin-aluno-detalhe', params: { id: props.id } })
}
</script>

<template>
  <div class="compart">
    <div class="barra-topo">
      <button type="button" class="btn btn-ghost btn-sm" @click="voltar">← Voltar ao aluno</button>
      <div class="barra-acoes">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="salvando" @click="salvar()">
          {{ salvando ? 'Salvando…' : 'Salvar revisão' }}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="salvando || !!erro || !comentario.trim()"
          @click="gerarPdf"
        >
          {{ desatualizada ? 'Revisar e gerar PDF' : '🖨️ Gerar PDF' }}
        </button>
      </div>
    </div>

    <div v-if="carregando" class="compart-container"><div class="card empty-state">Carregando…</div></div>

    <div v-else-if="erro" class="compart-container">
      <div class="card empty-state">
        <div class="empty-state-icon">📄</div>
        <h2 style="margin-bottom: 6px;">{{ erro.titulo }}</h2>
        <p class="list-row-sub">{{ erro.mensagem }}</p>
      </div>
    </div>

    <div v-else class="compart-container">
      <!-- ===== Preparação (só em tela) ===== -->
      <aside class="preparacao">
        <h2 class="prep-titulo">Preparar para o aluno</h2>
        <p class="list-row-sub">
          O aluno recebe um PDF com o resumo, a evolução por dimensão, os destaques e as recomendações abaixo — mais o seu
          comentário. Alertas, pendências e o contexto interno da IA nunca vão no PDF.
        </p>

        <div v-if="desatualizada" class="prep-aviso">
          A avaliação foi <strong>regerada</strong> depois da sua última revisão. Confira o texto atualizado e salve de novo
          antes de gerar o PDF.
        </div>

        <div class="prep-bloco">
          <label class="prep-rotulo" for="comentario-personal">Seu comentário para o aluno <span class="prep-obrigatorio">*</span></label>
          <textarea
            id="comentario-personal"
            v-model="comentario"
            rows="6"
            maxlength="5000"
            placeholder="Ex.: Mês muito bom! A constância nos treinos apareceu na força. Vamos focar na mobilidade de quadril no próximo ciclo."
          ></textarea>
          <p class="list-row-sub">Também entra no próximo acompanhamento mensal como a sua leitura (peso alto).</p>
        </div>

        <div v-for="secao in ['dimensao', 'destaque', 'recomendacao']" :key="secao" class="prep-bloco">
          <template v-if="grupos[secao].length">
            <div class="prep-rotulo">{{ TITULO_GRUPO[secao] }} no PDF</div>
            <label v-for="item in grupos[secao]" :key="item.chave" class="prep-item">
              <input type="checkbox" :checked="incluido(item.chave)" @change="alternar(item.chave)" />
              <span>
                <strong>{{ item.rotulo }}</strong>
                <span v-if="item.texto" class="prep-item-texto"> — {{ item.texto }}</span>
              </span>
            </label>
          </template>
        </div>
      </aside>

      <!-- ===== Documento (tela + PDF) ===== -->
      <article class="documento">
        <header class="doc-head">
          <div class="doc-eyebrow">Avaliação de acompanhamento</div>
          <h1>{{ aluno?.nome }}</h1>
          <div class="doc-mes">{{ rotuloMes }}</div>
        </header>

        <section v-if="documento.resumo_geral" class="doc-secao">
          <p class="doc-resumo">{{ documento.resumo_geral }}</p>
        </section>

        <section v-if="documento.dimensoes.length" class="doc-secao">
          <h2>Evolução por dimensão</h2>
          <div v-for="(dim, i) in documento.dimensoes" :key="i" class="doc-dimensao">
            <div class="doc-dimensao-nome">
              {{ dim.nome }}
              <span v-if="dim.tipo === 'hipotese'" class="doc-selo-possibilidade">possibilidade, não diagnóstico</span>
            </div>
            <div v-if="dim.situacao_atual" class="doc-dimensao-sit">{{ dim.situacao_atual }}</div>
            <div v-if="dim.evolucao_no_mes" class="doc-dimensao-evo">{{ dim.evolucao_no_mes }}</div>
          </div>
        </section>

        <section v-if="documento.destaques.length" class="doc-secao">
          <h2>Destaques do mês</h2>
          <ul><li v-for="(d, i) in documento.destaques" :key="i">{{ d }}</li></ul>
        </section>

        <section v-if="documento.recomendacoes.length" class="doc-secao">
          <h2>Recomendações</h2>
          <ul><li v-for="(r, i) in documento.recomendacoes" :key="i">{{ r }}</li></ul>
        </section>

        <section class="doc-secao doc-comentario">
          <h2>Comentário do seu personal</h2>
          <p v-if="comentario.trim()">{{ comentario }}</p>
          <p v-else class="doc-placeholder">— escreva um comentário ao lado —</p>
        </section>

        <footer class="doc-rodape">
          Elaborado com apoio de inteligência artificial e revisado por
          {{ revisao?.autor?.nome || auth.usuario?.nome || 'seu personal' }} · {{ hoje }}
        </footer>
      </article>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.compart {
  min-height: 100vh;
  background: var(--color-surface-alt, #f4f4f5);
}
.barra-topo {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e4e4e7);
}
.barra-acoes {
  display: flex;
  gap: 8px;
}
.compart-container {
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 16px 60px;
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 24px;
  align-items: start;
}
.preparacao {
  position: sticky;
  top: 68px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e4e4e7);
  border-radius: var(--radius-md, 10px);
  padding: 16px;
}
.prep-titulo {
  font-size: 15px;
  font-weight: 800;
  margin-bottom: 6px;
}
.prep-aviso {
  margin: 12px 0 0;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  border-radius: var(--radius-sm, 8px);
  background: #fef3c7;
  color: #92400e;
}
.prep-bloco {
  margin-top: 16px;
}
.prep-rotulo {
  display: block;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 8px;
}
.prep-obrigatorio {
  color: var(--color-danger, #dc2626);
}
.preparacao textarea {
  width: 100%;
}
.prep-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  line-height: 1.5;
  padding: 5px 0;
  cursor: pointer;
}
.prep-item input {
  margin-top: 2px;
  flex: none;
}
.prep-item-texto {
  color: var(--color-text-secondary, #52525b);
}

/* ===== Documento ===== */
.documento {
  background: #fff;
  border: 1px solid var(--color-border, #e4e4e7);
  border-radius: var(--radius-md, 10px);
  padding: 40px 44px;
  color: #18181b;
  font-size: 14px;
  line-height: 1.65;
}
.doc-head {
  border-bottom: 2px solid #18181b;
  padding-bottom: 14px;
  margin-bottom: 22px;
}
.doc-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #71717a;
}
.doc-head h1 {
  font-size: 25px;
  font-weight: 800;
  margin: 4px 0 2px;
}
.doc-mes {
  font-size: 14px;
  color: #52525b;
}
.doc-secao {
  margin-bottom: 20px;
}
.doc-secao h2 {
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  color: #27272a;
}
.doc-resumo {
  font-size: 15px;
  line-height: 1.6;
}
.doc-dimensao {
  padding: 8px 0;
  border-bottom: 1px solid #ececee;
}
.doc-dimensao:last-child {
  border-bottom: none;
}
.doc-dimensao-nome {
  font-weight: 700;
}
.doc-selo-possibilidade {
  display: inline-block;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #71717a;
  border: 1px solid #d4d4d8;
  border-radius: 999px;
  padding: 1px 8px;
  margin-left: 6px;
  vertical-align: middle;
}
.doc-dimensao-sit {
  color: #52525b;
  font-size: 13px;
}
.doc-dimensao-evo {
  margin-top: 2px;
}
.doc-secao ul {
  list-style: disc;
  padding-left: 22px;
}
.doc-secao li {
  margin-bottom: 4px;
}
.doc-comentario {
  margin-top: 26px;
  padding: 16px 18px;
  background: #f4f4f5;
  border-left: 3px solid #18181b;
  border-radius: 0 6px 6px 0;
  white-space: pre-wrap;
}
.doc-placeholder {
  color: #a1a1aa;
  font-style: italic;
}
.doc-rodape {
  margin-top: 30px;
  padding-top: 14px;
  border-top: 1px solid #d4d4d8;
  font-size: 11.5px;
  color: #71717a;
}

@media (max-width: 860px) {
  .compart-container {
    grid-template-columns: 1fr;
  }
  .preparacao {
    position: static;
  }
  .documento {
    padding: 28px 22px;
  }
}

@media print {
  .barra-topo,
  .preparacao {
    display: none !important;
  }
  .compart {
    background: #fff;
  }
  .compart-container {
    display: block;
    max-width: none;
    padding: 0;
  }
  .documento {
    border: none;
    border-radius: 0;
    padding: 0;
  }
  .doc-secao {
    break-inside: avoid;
  }
}
</style>
