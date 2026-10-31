import { defineStore } from 'pinia'
import equipeService from '../services/equipe.service.js'

// docs/adr/0030: logo da equipe no lugar do ícone do topo da sidebar.
// Compartilhado para que a troca na tela Equipe apareça na hora no AdminShell.
export const useEquipeStore = defineStore('equipe', {
  state: () => ({
    logoUrl: null
  }),
  actions: {
    async carregar() {
      try {
        const identidade = await equipeService.obterIdentidade()
        this.definirLogo(identidade.temLogo ? await equipeService.obterLogo() : null)
      } catch (_err) {
        // sem logo disponível - fica o ícone padrão
      }
    },
    definirLogo(blob) {
      if (this.logoUrl) URL.revokeObjectURL(this.logoUrl)
      this.logoUrl = blob ? URL.createObjectURL(blob) : null
    }
  }
})
