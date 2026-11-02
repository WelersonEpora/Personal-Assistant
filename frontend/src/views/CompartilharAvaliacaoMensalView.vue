<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import alunosService from '../services/alunos.service.js'
import avaliacoesMensaisService from '../services/avaliacoesMensais.service.js'
import compartilhadaService from '../services/avaliacaoMensalCompartilhada.service.js'
import equipeService from '../services/equipe.service.js'
import { useAuthStore } from '../stores/auth.store.js'
import { useToasts } from '../composables/useToasts.js'
import {
  listarItensExcluiveis,
  filtrarAvaliacaoParaAluno,
  exclusoesPadrao,
  textosOriginais,
  limparTextosEditados,
  chaveTextoDimensao,
  CHAVE_RESUMO
} from '../utils/avaliacaoMensalCompartilhada.js'
import ToastStack from '../components/ToastStack.vue'
import TrechoEditavel from '../components/TrechoEditavel.vue'

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md: tela de
// preparação do PDF. Fora do AdminShell para o print sair limpo (@media print
// esconde tudo menos o documento). O personal escreve um comentário, escolhe
// quais itens da avaliação mostrar e gera o PDF pelo "salvar como PDF" do
// navegador. O comentário entra no próximo ciclo mensal como insumo de peso alto.
// Adendo 2026-11-02: o personal ajusta o texto de cada trecho direto no
// documento (lápis) e escreve o comentário no próprio documento; o painel da
// esquerda fica só com o que entra no PDF e o que falta. Regerar a avaliação
// descarta os ajustes de texto (a revisão desatualizada não os aplica).
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
const textosEditados = ref({}) // { chave do trecho: texto ajustado }
const ajustesDescartados = ref(false) // revisão desatualizada tinha ajustes
const campoComentario = ref(null)

// docs/adr/0030: identidade da equipe no topo do documento. Falhar aqui não
// impede o PDF - sem logo fica só o nome (ou nada).
const equipe = ref(null)
const logoUrl = ref(null)

async function carregarIdentidade() {
  try {
    equipe.value = await equipeService.obterIdentidade()
    if (equipe.value.temLogo) logoUrl.value = URL.createObjectURL(await equipeService.obterLogo())
  } catch (_err) {
    equipe.value = auth.usuario?.equipe ? { nome: auth.usuario.equipe.nome, temLogo: false } : null
  }
}
onBeforeUnmount(() => {
  if (logoUrl.value) URL.revokeObjectURL(logoUrl.value)
})

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
const rotuloMes = computed(() => {
  const [ano, mes] = String(props.anoMes).split('-')
  return `${NOMES_MES[Number(mes) - 1]} de ${ano}`
})

// O "salvar como PDF" do navegador sugere o document.title como nome do
// arquivo. Fica valendo enquanto a tela está aberta (cobre também o Ctrl+P)
// e volta ao título original ao sair.
const tituloOriginal = document.title
const nomeArquivo = computed(() => {
  if (!aluno.value?.nome) return null
  const [ano, mes] = String(props.anoMes).split('-')
  const nome = `Acompanhamento Mensal - ${aluno.value.nome} - ${NOMES_MES[Number(mes) - 1]} ${ano}`
  return nome.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
})
watch(nomeArquivo, (nome) => {
  document.title = nome || tituloOriginal
})
onBeforeUnmount(() => {
  document.title = tituloOriginal
})

function formatarData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const hoje = computed(() => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }))

// docs/adr/0029: tabela da avaliação física do mês (calculada pelo código na
// geração) + parágrafo da IA para o aluno.
const resumoFisica = computed(() => avaliacao.value?.avaliacao_fisica_resumo_json || null)
const itensExcluiveis = computed(() =>
  listarItensExcluiveis(avaliacao.value?.avaliacao_json, resumoFisica.value, textosEditados.value)
)
const grupos = computed(() => {
  const g = { avaliacao_fisica: [], dimensao: [], destaque: [], recomendacao: [] }
  for (const item of itensExcluiveis.value) g[item.secao].push(item)
  return g
})
const TITULO_GRUPO = { avaliacao_fisica: 'Avaliação física', dimensao: 'Evolução por dimensão', destaque: 'Destaques', recomendacao: 'Recomendações' }

const documento = computed(() =>
  filtrarAvaliacaoParaAluno(avaliacao.value?.avaliacao_json, [...excluidos.value], resumoFisica.value, textosEditados.value)
)

const originais = computed(() => textosOriginais(avaliacao.value?.avaliacao_json))
function editado(chave) {
  return chave in textosEditados.value
}
// Voltar ao texto da IA (ou deixar igual a ele) tira o ajuste.
function ajustarTexto(chave, texto) {
  const t = { ...textosEditados.value }
  const limpo = String(texto || '').trim()
  if (!limpo || limpo === originais.value[chave]) delete t[chave]
  else t[chave] = limpo
  textosEditados.value = t
}
function restaurarTexto(chave) {
  ajustarTexto(chave, '')
}
// "dimensao:2" -> "dimensao:2:situacao_atual"
function chaveDim(dim, campo) {
  return chaveTextoDimensao(dim.chave.split(':')[1], campo)
}

function irParaComentario() {
  const el = campoComentario.value
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus({ preventScroll: true })
}

function formatarDia(ymd) {
  if (!ymd) return ''
  const [ano, mes, dia] = String(ymd).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

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
        titulo: 'Este Acompanhamento Mensal ainda não pode ser compartilhado',
        mensagem:
          dadosAvaliacao.status === 'dados_insuficientes'
            ? 'O mês foi fechado com dados insuficientes — não há Acompanhamento Mensal para enviar ao aluno.'
            : 'A IA não conseguiu gerar este Acompanhamento Mensal. Tente gerar de novo antes de compartilhar.'
      }
      return
    }

    const compart = await compartilhadaService.obter(props.id, props.anoMes)
    revisao.value = compart.revisao
    desatualizada.value = compart.desatualizada
    comentario.value = compart.revisao?.comentario || ''
    // Ajustes de texto valem só para o texto que foi revisado: avaliação
    // regerada depois = parte do texto novo da IA.
    const ajustesSalvos = compart.revisao?.textos_editados || {}
    if (compart.desatualizada) {
      textosEditados.value = {}
      ajustesDescartados.value = Object.keys(ajustesSalvos).length > 0
    } else {
      textosEditados.value = { ...ajustesSalvos }
    }
    // Primeira preparação: sugestões padrão (docs/adr/0029); depois, o que o
    // personal salvou.
    excluidos.value = new Set(
      compart.revisao ? compart.revisao.itens_excluidos || [] : exclusoesPadrao(dadosAvaliacao.avaliacao_json)
    )
  } catch (e) {
    const status = e.response?.status
    if (status === 404) {
      erro.value = { titulo: 'Acompanhamento Mensal não encontrado', mensagem: 'Volte à Linha do Tempo do aluno e tente de novo.' }
    } else {
      erro.value = { titulo: 'Não foi possível carregar', mensagem: 'Verifique a conexão e tente novamente.' }
    }
  } finally {
    carregando.value = false
  }
}
onMounted(() => {
  carregar()
  carregarIdentidade()
})

async function salvar({ silencioso = false } = {}) {
  if (!comentario.value.trim()) {
    showToast('Escreva um comentário para o aluno antes de salvar.', 'warning')
    return false
  }
  salvando.value = true
  try {
    const resultado = await compartilhadaService.salvar(props.id, props.anoMes, {
      comentario: comentario.value.trim(),
      itensExcluidos: [...excluidos.value],
      textosEditados: limparTextosEditados(textosEditados.value, avaliacao.value?.avaliacao_json)
    })
    revisao.value = resultado.revisao
    desatualizada.value = false
    ajustesDescartados.value = false
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
          :title="!erro && !comentario.trim() ? 'Escreva o comentário para o aluno' : undefined"
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
          O aluno recebe um PDF com o resumo, a avaliação física do mês (quando houver), a evolução por dimensão, os
          destaques e as recomendações abaixo — mais o seu comentário. Alertas, pendências e o contexto interno da IA nunca vão no PDF.
          Para ajustar um texto, use o lápis ao lado dele no documento.
        </p>

        <div v-if="desatualizada" class="prep-aviso">
          O Acompanhamento Mensal foi <strong>regerado</strong> depois da sua última revisão. Confira o texto atualizado e salve de novo
          antes de gerar o PDF.
          <template v-if="ajustesDescartados"> Os ajustes de texto que você tinha feito foram descartados.</template>
        </div>

        <div class="prep-status" :class="comentario.trim() ? 'prep-status-ok' : 'prep-status-pendente'">
          <template v-if="comentario.trim()">✓ Comentário para o aluno escrito</template>
          <template v-else>
            <span>Comentário para o aluno <span class="prep-obrigatorio">*</span> — falta escrever</span>
            <button type="button" class="prep-status-link" @click="irParaComentario">Escrever</button>
          </template>
        </div>

        <div v-for="secao in ['avaliacao_fisica', 'dimensao', 'destaque', 'recomendacao']" :key="secao" class="prep-bloco">
          <template v-if="grupos[secao].length">
            <div class="prep-rotulo">{{ TITULO_GRUPO[secao] }} no PDF</div>
            <label v-for="item in grupos[secao]" :key="item.chave" class="prep-item">
              <input type="checkbox" :checked="incluido(item.chave)" @change="alternar(item.chave)" />
              <span>
                <strong>{{ item.rotulo }}</strong>
                <span v-if="item.editado" class="prep-item-ajustado">ajustado</span>
                <span v-if="item.texto" class="prep-item-texto"> — {{ item.texto }}</span>
              </span>
            </label>
          </template>
        </div>
      </aside>

      <!-- ===== Documento (tela + PDF) ===== -->
      <article class="documento">
        <header class="doc-head">
          <div class="doc-head-texto">
            <div class="doc-eyebrow">Acompanhamento Mensal</div>
            <h1>{{ aluno?.nome }}</h1>
            <div class="doc-mes">{{ rotuloMes }}</div>
          </div>
          <div v-if="logoUrl || equipe?.nome" class="doc-marca">
            <img v-if="logoUrl" :src="logoUrl" :alt="equipe?.nome || 'Logo da equipe'" class="doc-logo" />
            <div v-else class="doc-marca-nome">{{ equipe.nome }}</div>
          </div>
        </header>

        <section v-if="documento.resumo_geral" class="doc-secao">
          <TrechoEditavel
            class="doc-resumo"
            :texto="documento.resumo_geral"
            :editado="editado(CHAVE_RESUMO)"
            :linhas="6"
            @alterar="ajustarTexto(CHAVE_RESUMO, $event)"
            @restaurar="restaurarTexto(CHAVE_RESUMO)"
          />
        </section>

        <section v-if="documento.avaliacao_fisica" class="doc-secao">
          <h2>Sua avaliação física</h2>
          <template v-if="documento.avaliacao_fisica.tabela">
            <table class="doc-tabela">
              <thead>
                <tr>
                  <th>Medida</th>
                  <th>{{ formatarDia(documento.avaliacao_fisica.tabela.data) }}</th>
                  <template v-if="documento.avaliacao_fisica.tabela.anterior_data">
                    <th>Anterior ({{ formatarDia(documento.avaliacao_fisica.tabela.anterior_data) }})</th>
                    <th>Diferença</th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(linha, i) in documento.avaliacao_fisica.tabela.linhas" :key="i">
                  <td>{{ linha.rotulo }}</td>
                  <td class="doc-num">{{ linha.atual }}</td>
                  <template v-if="documento.avaliacao_fisica.tabela.anterior_data">
                    <td class="doc-num">{{ linha.anterior || '—' }}</td>
                    <td class="doc-num">{{ linha.comparavel ? linha.diferenca || '—' : '—*' }}</td>
                  </template>
                </tr>
              </tbody>
            </table>
            <p v-if="documento.avaliacao_fisica.tabela.linhas.some((l) => !l.comparavel)" class="doc-nota">
              * Medido por outro método na avaliação anterior — os valores não são comparáveis.
            </p>
          </template>
          <TrechoEditavel
            v-if="documento.avaliacao_fisica.leitura"
            class="doc-leitura-fisica"
            :texto="documento.avaliacao_fisica.leitura"
            :editado="editado('avaliacao_fisica:leitura')"
            :linhas="5"
            @alterar="ajustarTexto('avaliacao_fisica:leitura', $event)"
            @restaurar="restaurarTexto('avaliacao_fisica:leitura')"
          />
        </section>

        <section v-if="documento.dimensoes.length" class="doc-secao">
          <h2>Evolução por dimensão</h2>
          <div v-for="dim in documento.dimensoes" :key="dim.chave" class="doc-dimensao">
            <div class="doc-dimensao-nome">
              {{ dim.nome }}
              <span v-if="dim.tipo === 'hipotese'" class="doc-selo-possibilidade">possibilidade, não diagnóstico</span>
            </div>
            <TrechoEditavel
              v-if="dim.situacao_atual"
              class="doc-dimensao-sit"
              :texto="dim.situacao_atual"
              :editado="editado(chaveDim(dim, 'situacao_atual'))"
              @alterar="ajustarTexto(chaveDim(dim, 'situacao_atual'), $event)"
              @restaurar="restaurarTexto(chaveDim(dim, 'situacao_atual'))"
            />
            <TrechoEditavel
              v-if="dim.evolucao_no_mes"
              class="doc-dimensao-evo"
              :texto="dim.evolucao_no_mes"
              :editado="editado(chaveDim(dim, 'evolucao_no_mes'))"
              @alterar="ajustarTexto(chaveDim(dim, 'evolucao_no_mes'), $event)"
              @restaurar="restaurarTexto(chaveDim(dim, 'evolucao_no_mes'))"
            />
          </div>
        </section>

        <section v-if="documento.destaques.length" class="doc-secao">
          <h2>Destaques do mês</h2>
          <ul>
            <li v-for="d in documento.destaques" :key="d.chave">
              <TrechoEditavel :texto="d.texto" :editado="editado(d.chave)" @alterar="ajustarTexto(d.chave, $event)" @restaurar="restaurarTexto(d.chave)" />
            </li>
          </ul>
        </section>

        <section v-if="documento.recomendacoes.length" class="doc-secao">
          <h2>Recomendações</h2>
          <ul>
            <li v-for="r in documento.recomendacoes" :key="r.chave">
              <TrechoEditavel :texto="r.texto" :editado="editado(r.chave)" @alterar="ajustarTexto(r.chave, $event)" @restaurar="restaurarTexto(r.chave)" />
            </li>
          </ul>
        </section>

        <!-- Comentário: caixa sempre aberta em tela (obrigatório); no PDF, só o texto. -->
        <section class="doc-secao doc-comentario" :class="{ 'doc-comentario-vazio': !comentario.trim() }">
          <h2>
            <label for="comentario-personal">Comentário do seu personal</label>
            <span class="so-tela prep-obrigatorio"> *</span>
          </h2>
          <textarea
            id="comentario-personal"
            ref="campoComentario"
            v-model="comentario"
            class="so-tela doc-comentario-campo"
            rows="5"
            maxlength="5000"
            placeholder="Ex.: Mês muito bom! A constância nos treinos apareceu na força. Vamos focar na mobilidade de quadril no próximo ciclo."
          ></textarea>
          <p class="so-tela doc-comentario-nota">Também entra no próximo Acompanhamento Mensal como a sua leitura (peso alto).</p>
          <p class="so-print">{{ comentario }}</p>
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
.prep-status {
  margin-top: 14px;
  padding: 9px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  border-radius: var(--radius-sm, 8px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.prep-status-pendente {
  background: #fef2f2;
  color: #991b1b;
}
.prep-status-ok {
  background: #f0fdf4;
  color: #166534;
  font-weight: 600;
}
.prep-status-link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 700;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.prep-item-ajustado {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 999px;
  background: #ede9fe;
  color: #6d28d9;
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
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  border-bottom: 2px solid #18181b;
  padding-bottom: 14px;
  margin-bottom: 22px;
}
.doc-head-texto {
  min-width: 0;
}
.doc-marca {
  flex: none;
  max-width: 40%;
  text-align: right;
}
.doc-logo {
  display: block;
  max-height: 64px;
  max-width: 180px;
  margin-left: auto;
  object-fit: contain;
}
.doc-marca-nome {
  font-size: 13px;
  font-weight: 700;
  color: #3f3f46;
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
.doc-tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.doc-tabela th {
  text-align: left;
  font-size: 11.5px;
  font-weight: 700;
  color: #71717a;
  border-bottom: 1px solid #d4d4d8;
  padding: 6px 8px 6px 0;
}
.doc-tabela td {
  border-bottom: 1px solid #ececee;
  padding: 6px 8px 6px 0;
}
.doc-num {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.doc-nota {
  font-size: 11.5px;
  color: #71717a;
  margin-top: 6px;
}
.doc-leitura-fisica {
  margin-top: 12px;
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
}
.doc-comentario .so-print {
  white-space: pre-wrap;
}
.doc-comentario h2 label {
  cursor: text;
}
.doc-comentario-campo {
  width: 100%;
  background: #fff;
  font: inherit;
  line-height: 1.55;
}
.doc-comentario-vazio .doc-comentario-campo {
  border-color: var(--color-danger, #dc2626);
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
}
.doc-comentario-nota {
  margin-top: 6px;
  font-size: 11.5px;
  color: #71717a;
}
.so-print {
  display: none;
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
  .so-tela {
    display: none !important;
  }
  .so-print {
    display: block;
  }
}
</style>
