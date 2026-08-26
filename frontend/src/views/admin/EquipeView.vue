<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import equipeService from '../../services/equipe.service.js'
import membrosService from '../../services/membros.service.js'
import { useAuthStore } from '../../stores/auth.store.js'
import { corParaId, iniciais } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'

const { toasts, showToast } = useToasts()
const auth = useAuthStore()

const equipe = ref(null)
const membros = ref([])
const carregando = ref(true)

async function carregarFotos() {
  await Promise.all(
    membros.value
      .filter((membro) => membro.usuario.foto_caminho)
      .map(async (membro) => {
        try {
          const blob = await membrosService.obterFoto(membro.id)
          membro.fotoUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem foto disponível - fica só com as iniciais
        }
      })
  )
}

async function carregar() {
  carregando.value = true
  try {
    const [dadosEquipe, listaMembros] = await Promise.all([equipeService.obter(), membrosService.listar()])
    equipe.value = dadosEquipe
    membros.value = listaMembros
    await carregarFotos()
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

function revogarFotos() {
  membros.value.forEach((membro) => {
    if (membro.fotoUrl) URL.revokeObjectURL(membro.fotoUrl)
  })
}
onBeforeUnmount(revogarFotos)

function papelLabel(papel) {
  return { owner: 'Owner', colaborador: 'Colaborador' }[papel] || papel
}

function mensagemErro(err, padrao) {
  return err.response?.data?.error?.message || padrao
}

// --- editar nome da equipe ---
const modalEquipeAberto = ref(false)
const nomeEquipe = ref('')
const salvandoEquipe = ref(false)

function abrirModalEquipe() {
  nomeEquipe.value = equipe.value?.nome || ''
  modalEquipeAberto.value = true
}

async function salvarNomeEquipe() {
  if (!nomeEquipe.value.trim()) return
  salvandoEquipe.value = true
  try {
    equipe.value = await equipeService.atualizarNome(nomeEquipe.value.trim())
    modalEquipeAberto.value = false
    showToast('Nome da equipe atualizado.', 'success')
  } catch (err) {
    showToast(mensagemErro(err, 'Não foi possível atualizar o nome da equipe.'), 'warning')
  } finally {
    salvandoEquipe.value = false
  }
}

// --- criar/editar membro (mesmo modal, membroEditando null = criação) ---
const modalMembroAberto = ref(false)
const membroEditando = ref(null)
const salvandoMembro = ref(false)
const form = ref({ nome: '', email: '', senha: '', especialidade: '', papel: 'colaborador', ativo: true })

function abrirModalNovoMembro() {
  membroEditando.value = null
  form.value = { nome: '', email: '', senha: '', especialidade: '', papel: 'colaborador', ativo: true }
  modalMembroAberto.value = true
}

function abrirModalEditarMembro(membro) {
  membroEditando.value = membro
  form.value = {
    nome: membro.usuario.nome,
    email: membro.usuario.email,
    senha: '',
    especialidade: membro.usuario.especialidade || '',
    papel: membro.papel,
    ativo: membro.ativo
  }
  modalMembroAberto.value = true
}

// Foto (avatar) do personal - só disponível editando (não faz sentido antes
// do membro existir). Se for a própria foto do usuário logado, atualiza
// também a sessão em memória (auth.store.js) pra topbar/sidebar refletirem
// na hora, sem precisar deslogar/logar de novo.
const enviandoFoto = ref(false)
const removendoFoto = ref(false)
const fotoInput = ref(null)

function selecionarFoto() {
  fotoInput.value?.click()
}

async function onFotoSelecionada(evento) {
  const arquivo = evento.target.files?.[0]
  evento.target.value = ''
  if (!arquivo || !membroEditando.value) return
  enviandoFoto.value = true
  try {
    const atualizado = await membrosService.enviarFoto(membroEditando.value.id, arquivo)
    membroEditando.value.usuario.foto_caminho = atualizado.usuario.foto_caminho
    if (membroEditando.value.fotoUrl) URL.revokeObjectURL(membroEditando.value.fotoUrl)
    const blob = await membrosService.obterFoto(membroEditando.value.id)
    membroEditando.value.fotoUrl = URL.createObjectURL(blob)
    if (membroEditando.value.usuario.id === auth.usuario?.id) {
      auth.atualizarUsuario({ foto_caminho: atualizado.usuario.foto_caminho })
    }
    showToast('Foto atualizada.', 'success')
  } catch (_err) {
    showToast('Não foi possível enviar a foto (use JPEG, PNG ou WebP, até 5MB).', 'warning')
  } finally {
    enviandoFoto.value = false
  }
}

async function removerFoto() {
  if (!membroEditando.value) return
  removendoFoto.value = true
  try {
    const atualizado = await membrosService.removerFoto(membroEditando.value.id)
    membroEditando.value.usuario.foto_caminho = atualizado.usuario.foto_caminho
    if (membroEditando.value.fotoUrl) URL.revokeObjectURL(membroEditando.value.fotoUrl)
    membroEditando.value.fotoUrl = null
    if (membroEditando.value.usuario.id === auth.usuario?.id) {
      auth.atualizarUsuario({ foto_caminho: null })
    }
    showToast('Foto removida.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível remover a foto.', 'warning')
  } finally {
    removendoFoto.value = false
  }
}

async function salvarMembro() {
  if (!form.value.nome.trim() || !form.value.email.trim()) return
  salvandoMembro.value = true
  try {
    if (membroEditando.value) {
      await membrosService.atualizar(membroEditando.value.id, {
        nome: form.value.nome.trim(),
        email: form.value.email.trim(),
        especialidade: form.value.especialidade.trim() || null,
        papel: form.value.papel,
        ativo: form.value.ativo,
        ...(form.value.senha ? { senha: form.value.senha } : {})
      })
      showToast('Membro atualizado.', 'success')
    } else {
      await membrosService.criar({
        nome: form.value.nome.trim(),
        email: form.value.email.trim(),
        senha: form.value.senha,
        especialidade: form.value.especialidade.trim() || null,
        papel: form.value.papel
      })
      showToast('Membro cadastrado.', 'success')
    }
    modalMembroAberto.value = false
    await carregar()
  } catch (err) {
    showToast(mensagemErro(err, 'Não foi possível salvar o membro.'), 'warning')
  } finally {
    salvandoMembro.value = false
  }
}
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Equipe</h1>
        <p>Gerencie os membros com acesso ao Personal Assistant.</p>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px; padding: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div>
          <div style="font-size: 18px; font-weight: 700;">{{ equipe?.nome }}</div>
          <div style="font-size: 13px; color: var(--color-text-secondary);">{{ equipe?.totalMembros || 0 }} membro(s)</div>
        </div>
        <button class="btn btn-secondary" type="button" @click="abrirModalEquipe">Editar nome</button>
      </div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div style="font-weight: 700;">Membros</div>
        <button class="btn btn-primary" type="button" @click="abrirModalNovoMembro">+ Novo membro</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Especialidade</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="membro in membros" :key="membro.id">
              <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <img v-if="membro.fotoUrl" :src="membro.fotoUrl" class="avatar sz-sm" alt="" />
                  <span v-else class="avatar sz-sm" :style="{ background: corParaId(membro.usuario.id) }">{{ iniciais(membro.usuario.nome) }}</span>
                  {{ membro.usuario.nome }}
                </div>
              </td>
              <td>{{ membro.usuario.email }}</td>
              <td>{{ membro.usuario.especialidade || '—' }}</td>
              <td><span class="badge" :class="membro.papel === 'owner' ? 'badge-primary' : 'badge-neutral'">{{ papelLabel(membro.papel) }}</span></td>
              <td><span class="badge" :class="membro.ativo ? 'badge-success' : 'badge-neutral'">{{ membro.ativo ? 'Ativo' : 'Inativo' }}</span></td>
              <td><button class="btn btn-ghost" type="button" @click="abrirModalEditarMembro(membro)">Editar</button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!carregando && !membros.length" class="empty-state">Nenhum membro cadastrado ainda.</div>
      </div>
    </div>

    <div v-if="modalEquipeAberto" class="sheet-overlay open" style="position: fixed;" @click.self="modalEquipeAberto = false">
      <div class="card" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 360px; padding: 22px;">
        <h3 style="margin-bottom: 14px;">Editar nome da equipe</h3>
        <form @submit.prevent="salvarNomeEquipe">
          <div class="form-field" style="margin-bottom: 16px;">
            <label>Nome</label>
            <input v-model="nomeEquipe" type="text" required autofocus />
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-ghost" @click="modalEquipeAberto = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="salvandoEquipe || !nomeEquipe.trim()">Salvar</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="modalMembroAberto" class="sheet-overlay open" style="position: fixed;" @click.self="modalMembroAberto = false">
      <div class="card" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 420px; padding: 22px;">
        <h3 style="margin-bottom: 14px;">{{ membroEditando ? 'Editar membro' : 'Novo membro' }}</h3>
        <div v-if="membroEditando" style="display: flex; justify-content: center; margin-bottom: 16px;">
          <div style="position: relative;">
            <img v-if="membroEditando.fotoUrl" :src="membroEditando.fotoUrl" class="avatar sz-lg" alt="" />
            <span v-else class="avatar sz-lg" :style="{ background: corParaId(membroEditando.usuario.id) }">{{ iniciais(membroEditando.usuario.nome) }}</span>
            <button type="button" class="btn btn-ghost" style="position: absolute; bottom: -8px; right: -8px; padding: 2px 6px; font-size: 11px;" :disabled="enviandoFoto" @click="selecionarFoto">
              📷
            </button>
            <button
              v-if="membroEditando.fotoUrl"
              type="button"
              class="btn btn-ghost"
              title="Remover foto"
              style="position: absolute; bottom: -8px; left: -8px; padding: 2px 6px; font-size: 11px;"
              :disabled="removendoFoto"
              @click="removerFoto"
            >
              🗑️
            </button>
            <input ref="fotoInput" type="file" accept="image/jpeg,image/png,image/webp" style="display: none;" @change="onFotoSelecionada" />
          </div>
        </div>
        <form @submit.prevent="salvarMembro">
          <div class="form-grid" style="margin-bottom: 16px;">
            <div class="form-field form-field-full">
              <label>Nome</label>
              <input v-model="form.nome" type="text" required autofocus />
            </div>
            <div class="form-field form-field-full">
              <label>E-mail</label>
              <input v-model="form.email" type="email" required />
            </div>
            <div class="form-field form-field-full">
              <label>{{ membroEditando ? 'Nova senha (opcional)' : 'Senha' }}</label>
              <input
                v-model="form.senha"
                type="password"
                :required="!membroEditando"
                minlength="8"
                autocomplete="new-password"
                :placeholder="membroEditando ? 'Deixe em branco para manter a atual' : ''"
              />
            </div>
            <div class="form-field form-field-full">
              <label>Especialidade (opcional)</label>
              <input v-model="form.especialidade" type="text" />
            </div>
            <div class="form-field">
              <label>Papel</label>
              <select v-model="form.papel">
                <option value="owner">Owner</option>
                <option value="colaborador">Colaborador</option>
              </select>
            </div>
            <div v-if="membroEditando" class="form-field" style="display: flex; align-items: flex-end;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                <input v-model="form.ativo" type="checkbox" style="width: auto;" />
                Conta ativa
              </label>
            </div>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-ghost" @click="modalMembroAberto = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="salvandoMembro || !form.nome.trim() || !form.email.trim()">Salvar</button>
          </div>
        </form>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>
