<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.store.js'
import { useEquipeStore } from '../../stores/equipe.store.js'
import registrosService from '../../services/registros.service.js'
import usuariosService from '../../services/usuarios.service.js'
import { iniciais, corParaId } from '../../utils/registroStatus.js'
import ConfirmDialog from '../../components/ConfirmDialog.vue'

const NAV_ITEMS = [
  {
    // "olhar" - panoramas de leitura: o meu dia, a minha atividade, a área.
    // Sem rótulo: é o primeiro bloco do menu, o título seria redundante.
    grupo: null,
    itens: [
      { nome: 'admin-dashboard', icone: '📊', label: 'Dashboard' },
      { nome: 'admin-atendimentos', icone: '📈', label: 'Atendimentos' },
      { nome: 'admin-radar', icone: '📡', label: 'Radar' }
    ]
  },
  {
    // "fazer" - o pipeline do dia a dia, na ordem do fluxo:
    // Relatos (entra) -> Revisão (confirma) -> Histórico (arquivo)
    grupo: 'Operação',
    itens: [
      { nome: 'admin-alunos', icone: '👥', label: 'Alunos' },
      { nome: 'admin-exercicios', icone: '🏋️', label: 'Exercícios' },
      { nome: 'admin-registros', icone: '🎙️', label: 'Relatos' },
      { nome: 'admin-revisao', icone: '✅', label: 'Revisão', badge: true },
      { nome: 'admin-historico', icone: '🕒', label: 'Histórico' }
    ]
  },
  {
    grupo: 'Sistema',
    itens: [
      { nome: 'admin-equipe', icone: '🏢', label: 'Equipe', somenteOwner: true },
      { nome: 'admin-configuracoes', icone: '⚙️', label: 'Configurações' },
      { nome: 'captura', icone: '📱', label: 'Modo captura' }
    ]
  }
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
// rodapé da sidebar: identidade da equipe (o usuário fica na topbar)
const equipe = useEquipeStore()
onMounted(() => equipe.carregar())

// Navegação em drawer no mobile (desktop mantém a sidebar fixa) — fecha ao
// trocar de rota e ao tocar no overlay.
const menuAberto = ref(false)
watch(() => route.fullPath, () => { menuAberto.value = false })

// O ☰ da topbar: no desktop recolhe a sidebar para só os ícones; no mobile
// abre/fecha o drawer. Preferência de recolher é de cada navegador
// (localStorage é só conveniência - sem ele, abre expandida).
const CHAVE_RECOLHIDA = 'pa.sidebar.recolhida'
function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === '1'
  } catch {
    return false
  }
}
const sidebarRecolhida = ref(lerRecolhida())
const MOBILE = '(max-width: 760px)'
const ehMobile = ref(window.matchMedia(MOBILE).matches)
const consultaMobile = window.matchMedia(MOBILE)
const aoMudarLargura = (e) => { ehMobile.value = e.matches }
onMounted(() => consultaMobile.addEventListener('change', aoMudarLargura))
onBeforeUnmount(() => consultaMobile.removeEventListener('change', aoMudarLargura))

const rotuloMenu = computed(() => {
  if (ehMobile.value) return menuAberto.value ? 'Fechar menu' : 'Abrir menu'
  return sidebarRecolhida.value ? 'Expandir menu' : 'Recolher menu'
})
function alternarMenu() {
  if (ehMobile.value) {
    menuAberto.value = !menuAberto.value
    return
  }
  sidebarRecolhida.value = !sidebarRecolhida.value
  try {
    localStorage.setItem(CHAVE_RECOLHIDA, sidebarRecolhida.value ? '1' : '0')
  } catch {
    // sem storage: vale só nesta sessão
  }
}

const pendentesRevisao = ref(0)
let intervalId = null

async function atualizarContadores() {
  try {
    const revisao = await registrosService.listar({ status: 'aguardando_revisao' })
    pendentesRevisao.value = revisao.length
  } catch (_err) {
    // silencioso - contador só reflete a última leitura bem-sucedida
  }
}

onMounted(() => {
  atualizarContadores()
  intervalId = setInterval(atualizarContadores, 20000)
})
onBeforeUnmount(() => clearInterval(intervalId))

// Avatar do próprio usuário logado (topbar + rodapé da sidebar) - blob
// buscado sob autenticação, mesmo padrão de AlunosView/AlunoDetalheView.
const fotoUrl = ref(null)
async function carregarFotoPropria() {
  if (fotoUrl.value) {
    URL.revokeObjectURL(fotoUrl.value)
    fotoUrl.value = null
  }
  if (!auth.usuario?.foto_caminho) return
  try {
    const blob = await usuariosService.obterFotoPropria()
    fotoUrl.value = URL.createObjectURL(blob)
  } catch (_err) {
    // sem foto disponível - fica só com as iniciais
  }
}
onMounted(carregarFotoPropria)
watch(() => auth.usuario?.foto_caminho, carregarFotoPropria)
onBeforeUnmount(() => {
  if (fotoUrl.value) URL.revokeObjectURL(fotoUrl.value)
})

function sair() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="app-shell" :class="{ 'menu-aberto': menuAberto, 'sidebar-recolhida': sidebarRecolhida }">
    <!-- topbar escura de ponta a ponta: ☰ + marca à esquerda, usuário à direita -->
    <header class="topbar">
      <button
        class="topbar-menu-btn"
        type="button"
        :aria-label="rotuloMenu"
        :title="rotuloMenu"
        @click="alternarMenu"
      >☰</button>
      <div class="topbar-marca">
        <div class="sidebar-brand-mark"><img src="/icons/marca-figura.png" alt="" /></div>
        <div class="topbar-marca-texto">
          <div class="topbar-marca-nome">Personal Assistant</div>
          <div class="topbar-marca-sub">Gestão Fitness Inteligente</div>
        </div>
      </div>
      <div class="topbar-right">
        <div class="topbar-usuario">
          <img v-if="fotoUrl" :src="fotoUrl" class="avatar sz-sm" alt="" />
          <span v-else class="avatar sz-sm" :style="{ background: corParaId(auth.usuario?.id) }">{{ iniciais(auth.usuario?.nome) }}</span>
          <span class="topbar-usuario-nome">{{ auth.usuario?.nome }}</span>
        </div>
        <button class="topbar-sair" type="button" title="Sair" @click="sair">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />
          </svg>
          <span class="topbar-sair-texto">Sair</span>
        </button>
      </div>
    </header>

    <div class="app-corpo">
      <div class="drawer-overlay" @click="menuAberto = false"></div>
      <aside class="sidebar" :class="{ open: menuAberto }">
        <nav>
          <template v-for="(grupo, i) in NAV_ITEMS" :key="grupo.grupo || i">
            <div v-if="grupo.grupo" class="nav-group-label">{{ grupo.grupo }}</div>
            <router-link
              v-for="item in grupo.itens.filter((i) => !i.somenteOwner || auth.usuario?.papel === 'owner')"
              :key="item.nome"
              class="nav-item"
              :to="{ name: item.nome }"
              :title="sidebarRecolhida ? item.label : null"
            >
              <span class="nav-icon">{{ item.icone }}</span><span class="nav-label">{{ item.label
              }}</span><span v-if="item.badge && pendentesRevisao > 0" class="nav-item-badge">{{ pendentesRevisao }}</span>
            </router-link>
          </template>
        </nav>

        <!-- identidade da equipe (docs/adr/0030): logo (quando houver) e nome; as iniciais só aparecem no menu recolhido -->
        <div class="sidebar-footer" :title="sidebarRecolhida ? auth.usuario?.equipe?.nome : null">
          <img v-if="equipe.logoUrl" :src="equipe.logoUrl" class="sidebar-equipe-logo" alt="" />
          <span v-else class="sidebar-equipe-logo sem-logo" :style="{ background: corParaId(auth.usuario?.equipe?.id) }">
            {{ iniciais(auth.usuario?.equipe?.nome) }}
          </span>
          <div class="sidebar-footer-texto sidebar-footer-name">{{ auth.usuario?.equipe?.nome }}</div>
        </div>
      </aside>

      <main class="content">
        <router-view @registro-processado="atualizarContadores" />
      </main>
    </div>

    <ConfirmDialog />
  </div>
</template>
