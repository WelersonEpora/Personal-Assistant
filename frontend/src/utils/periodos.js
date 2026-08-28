// Presets de período compartilhados pelas telas de listagem/relatório
// (Atendimentos - docs/adr/0020 - e filtro do Histórico). Todos ancorados em
// "hoje" e resolvidos para { de, ate } em "AAAA-MM-DD". `tudo` => sem limite
// (de/ate nulos); `personalizado` => usa as datas do seletor.

const MS_DIA = 86_400_000

function isoHoje() {
  return new Date().toISOString().slice(0, 10)
}
function iso(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export const PRESETS_PERIODO = [
  { chave: 'mes_atual', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
  { chave: 'ultimos_30', rotulo: 'Últimos 30 dias' },
  { chave: 'ultimos_90', rotulo: 'Últimos 90 dias' },
  { chave: 'ano_atual', rotulo: 'Este ano' },
  { chave: 'tudo', rotulo: 'Tudo' },
  { chave: 'personalizado', rotulo: 'Personalizado' }
]

export function resolverPeriodo(chave, custom = {}) {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth() + 1

  if (chave === 'mes_atual') return { de: iso(ano, mes, 1), ate: isoHoje() }
  if (chave === 'mes_passado') {
    const y = mes === 1 ? ano - 1 : ano
    const m = mes === 1 ? 12 : mes - 1
    const ultimoDia = new Date(y, m, 0).getDate()
    return { de: iso(y, m, 1), ate: iso(y, m, ultimoDia) }
  }
  if (chave === 'ultimos_30' || chave === 'ultimos_90') {
    const dias = chave === 'ultimos_30' ? 29 : 89
    return { de: new Date(Date.now() - dias * MS_DIA).toISOString().slice(0, 10), ate: isoHoje() }
  }
  if (chave === 'ano_atual') return { de: iso(ano, 1, 1), ate: isoHoje() }
  if (chave === 'tudo') return { de: null, ate: null }
  return { de: custom.de || null, ate: custom.ate || null } // personalizado
}

// O período está pronto para consulta? `tudo` sempre; `personalizado` só com as
// duas datas coerentes.
export function periodoPronto(chave, custom = {}) {
  if (chave !== 'personalizado') return true
  return Boolean(custom.de && custom.ate && custom.de <= custom.ate)
}
