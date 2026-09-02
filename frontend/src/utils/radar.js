// docs/adr/0022 - rótulos e helpers puros do Radar. Sem lógica de rede.

// Tipo de documento -> rótulo curto + sufixo da classe do badge
// (assets/tokens.css: badge-primary/info/neutral) + família, que agrupa os
// tipos por categoria (não por qualidade - a ADR proíbe selo metodológico):
//   entidade = documento de um órgão/entidade (diretriz, position stand, consenso)
//   sintese  = síntese de evidência (revisão sistemática, meta-análise)
//   estudo   = estudo individual / outro
export const TIPO_META = {
  diretriz: { rotulo: 'Diretriz', badge: 'primary', familia: 'entidade' },
  position_stand: { rotulo: 'Position stand', badge: 'primary', familia: 'entidade' },
  consenso: { rotulo: 'Consenso', badge: 'primary', familia: 'entidade' },
  revisao_sistematica: { rotulo: 'Revisão sistemática', badge: 'info', familia: 'sintese' },
  meta_analise: { rotulo: 'Meta-análise', badge: 'info', familia: 'sintese' },
  estudo_primario: { rotulo: 'Estudo primário', badge: 'neutral', familia: 'estudo' },
  outro: { rotulo: 'Publicação', badge: 'neutral', familia: 'estudo' }
}

export function tipoMeta(tipo) {
  return TIPO_META[tipo] || TIPO_META.outro
}

// "informada pela IA" - vem como texto livre; só normaliza espaços.
export function dataInformada(valor) {
  if (!valor || typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo || null
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// Agrupa o feed por mês de entrada no Radar (`created_at`) - dá ritmo à
// leitura e funciona para qualquer janela do filtro de período. Os itens já
// vêm do mais novo para o mais antigo; a ordem dos grupos segue isso.
export function agruparPorMes(itens) {
  const grupos = []
  const porChave = new Map()
  for (const item of itens) {
    const d = new Date(item.created_at)
    const chave = `${d.getFullYear()}-${d.getMonth()}`
    let grupo = porChave.get(chave)
    if (!grupo) {
      grupo = { chave, rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}`, itens: [] }
      porChave.set(chave, grupo)
      grupos.push(grupo)
    }
    grupo.itens.push(item)
  }
  return grupos
}
