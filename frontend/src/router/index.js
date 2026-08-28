import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.store.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { publica: true } },
  // Acesso do aluno à ficha por link temporário (docs/adr/0014) - pública,
  // somente leitura, fora de /admin e /captura, sem login. O token no path
  // é o único identificador; nenhum id de aluno/ficha aparece na URL.
  {
    path: '/ficha/:token',
    name: 'ficha-publica',
    component: () => import('../views/FichaPublicaView.vue'),
    props: true,
    meta: { publica: true }
  },
  { path: '/captura', name: 'captura', component: () => import('../views/captura/CapturaView.vue') },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminShell.vue'),
    children: [
      { path: '', redirect: { name: 'admin-dashboard' } },
      { path: 'dashboard', name: 'admin-dashboard', component: () => import('../views/admin/DashboardView.vue'), meta: { titulo: 'Dashboard' } },
      { path: 'alunos', name: 'admin-alunos', component: () => import('../views/admin/AlunosView.vue'), meta: { titulo: 'Alunos' } },
      {
        path: 'alunos/:id',
        name: 'admin-aluno-detalhe',
        component: () => import('../views/admin/AlunoDetalheView.vue'),
        props: true,
        meta: { titulo: 'Alunos' }
      },
      // Ficha de Treino, Avaliações Físicas e Acompanhamento deixaram de ser
      // tela própria - viraram abas da tela do aluno (docs/adr/0015). Redirect
      // para não quebrar links antigos; a aba vai no query (?aba=...).
      {
        path: 'alunos/:id/ficha-treino',
        redirect: (to) => ({ name: 'admin-aluno-detalhe', params: { id: to.params.id }, query: { aba: 'ficha' } })
      },
      {
        path: 'alunos/:id/avaliacoes-fisicas',
        redirect: (to) => ({ name: 'admin-aluno-detalhe', params: { id: to.params.id }, query: { aba: 'avaliacoes' } })
      },
      {
        path: 'alunos/:id/acompanhamento',
        redirect: (to) => ({ name: 'admin-aluno-detalhe', params: { id: to.params.id } })
      },
      { path: 'exercicios', name: 'admin-exercicios', component: () => import('../views/admin/ExerciciosView.vue'), meta: { titulo: 'Exercícios' } },
      { path: 'registros', name: 'admin-registros', component: () => import('../views/admin/RegistrosView.vue'), meta: { titulo: 'Relatos' } },
      {
        path: 'revisao/:id?',
        name: 'admin-revisao',
        component: () => import('../views/admin/RevisaoView.vue'),
        props: true,
        meta: { titulo: 'Revisão da IA' }
      },
      { path: 'historico', name: 'admin-historico', component: () => import('../views/admin/HistoricoView.vue'), meta: { titulo: 'Histórico' } },
      { path: 'atendimentos', name: 'admin-atendimentos', component: () => import('../views/admin/AtividadesView.vue'), meta: { titulo: 'Atendimentos' } },
      {
        path: 'equipe',
        name: 'admin-equipe',
        component: () => import('../views/admin/EquipeView.vue'),
        meta: { titulo: 'Equipe', somenteOwner: true }
      },
      {
        path: 'configuracoes',
        name: 'admin-configuracoes',
        component: () => import('../views/admin/ConfiguracoesView.vue'),
        meta: { titulo: 'Configurações' }
      }
    ]
  },
  { path: '/', redirect: '/login' },
  { path: '/:pathMatch(.*)*', redirect: '/login' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (!to.meta.publica && !auth.autenticado) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.autenticado) {
    return window.innerWidth < 760 ? { name: 'captura' } : { name: 'admin-dashboard' }
  }
  // Defesa em profundidade - a autorização real é o 403 do backend
  // (exigirOwner). Aqui só evita mostrar a tela pra quem não deveria vê-la.
  if (to.meta.somenteOwner && auth.usuario?.papel !== 'owner') {
    return { name: 'admin-dashboard' }
  }
  return true
})

export default router
