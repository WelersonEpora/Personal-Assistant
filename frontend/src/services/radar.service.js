import http from './http.js'

// docs/adr/0022 - Radar ("fofoqueira científica"). Feed global, só leitura.
// Filtro de período opcional (de/ate, "AAAA-MM-DD") por created_at. Rodar a
// busca e curar o feed são scripts de operador no backend (npm run
// radar:rodar / radar:ocultar / radar:execucoes) - sem endpoint, porque o
// feed é compartilhado por todos os tenants.
// A tela não pagina: pede uma página grande e filtra (busca textual) em
// memória - feed curado e semanal, ver docs/adr/0022 §9.
async function listar({ de, ate, grupos } = {}) {
  const params = { por_pagina: 300 }
  if (de) params.de = de
  if (ate) params.ate = ate
  if (grupos && grupos.length) params.grupos = grupos.join(',')
  const { data } = await http.get('/api/v1/radar', { params })
  return data.data
}

export default { listar }
