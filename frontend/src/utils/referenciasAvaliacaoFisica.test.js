import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classificar,
  contextoDoAluno,
  descreverFaixas,
  explicacao,
  resumoReferencia,
  segmentosRegua,
  posicaoNaEscala,
  variacao,
  temReferencia
} from './referenciasAvaliacaoFisica.js'

// docs/adr/0031 - referências de leitura da avaliação física.

const homem30 = { sexo: 'M', idade: 30, valores: {} }
const mulher45 = { sexo: 'F', idade: 45, valores: {} }

test('contextoDoAluno: sexo válido e idade na data da avaliação', () => {
  const ctx = contextoDoAluno({ sexo: 'F', data_nascimento: '1990-11-15' }, '2026-10-31')
  assert.equal(ctx.sexo, 'F')
  assert.equal(ctx.idade, 35)
  assert.equal(contextoDoAluno({ sexo: 'X' }, '2026-10-31').sexo, null)
  assert.equal(contextoDoAluno(null, '2026-10-31').idade, null)
})

test('métrica sem tabela: null (só explicação)', () => {
  assert.equal(classificar('peso', 80, homem30), null)
  assert.equal(classificar('dobra_abdominal', 18, homem30), null)
  assert.equal(temReferencia('peso'), false)
  assert.equal(temReferencia('imc'), true)
})

test('IMC adulto: faixas da OMS com limites exclusivos', () => {
  assert.equal(classificar('imc', 18.4, homem30).rotulo, 'Baixo peso')
  assert.equal(classificar('imc', 18.5, homem30).rotulo, 'Normal')
  assert.equal(classificar('imc', 24.9, homem30).rotulo, 'Normal')
  assert.equal(classificar('imc', 25, homem30).rotulo, 'Sobrepeso')
  assert.equal(classificar('imc', 30, homem30).rotulo, 'Obesidade I')
  assert.equal(classificar('imc', 41, homem30).tom, 'danger')
})

test('IMC: 60+ usa Lipschitz (≤ 22 baixo peso) e menor de 18 fica sem referência', () => {
  const idoso = { sexo: 'F', idade: 65, valores: {} }
  assert.equal(classificar('imc', 22, idoso).rotulo, 'Baixo peso')
  assert.equal(classificar('imc', 22.1, idoso).rotulo, 'Adequado')
  assert.equal(classificar('imc', 27, idoso).rotulo, 'Sobrepeso')
  assert.match(classificar('imc', 27, idoso).fonte, /Lipschitz/)
  assert.equal(classificar('imc', 20, { idade: 15 }).semReferencia, true)
})

test('IMC sem data de nascimento: usa a tabela de adulto', () => {
  assert.equal(classificar('imc', 26, { sexo: null, idade: null }).rotulo, 'Sobrepeso')
})

test('% de gordura: Gallagher por sexo e faixa etária', () => {
  assert.equal(classificar('percentual_gordura', 7.9, homem30).rotulo, 'Baixa')
  assert.equal(classificar('percentual_gordura', 19.9, homem30).rotulo, 'Adequada')
  assert.equal(classificar('percentual_gordura', 20, homem30).rotulo, 'Elevada')
  assert.equal(classificar('percentual_gordura', 25, homem30).rotulo, 'Muito elevada')
  // mesma % muda de faixa com a idade
  assert.equal(classificar('percentual_gordura', 33.5, { sexo: 'F', idade: 30 }).rotulo, 'Elevada')
  assert.equal(classificar('percentual_gordura', 33.5, mulher45).rotulo, 'Adequada')
  assert.equal(classificar('percentual_gordura', 41, { sexo: 'F', idade: 70 }).rotulo, 'Elevada')
})

test('% de gordura sem sexo ou nascimento: avisa o que falta no cadastro', () => {
  const r = classificar('percentual_gordura', 20, { sexo: null, idade: null })
  assert.equal(r.semReferencia, true)
  assert.match(r.motivo, /sexo e data de nascimento/)
  assert.match(classificar('perimetro_cintura', 90, { sexo: null, idade: 30 }).motivo, /falta sexo/)
})

test('cintura e RCQ: cortes da OMS por sexo', () => {
  assert.equal(classificar('perimetro_cintura', 93.9, homem30).rotulo, 'Adequada')
  assert.equal(classificar('perimetro_cintura', 94, homem30).rotulo, 'Risco aumentado')
  assert.equal(classificar('perimetro_cintura', 102, homem30).rotulo, 'Risco muito aumentado')
  assert.equal(classificar('perimetro_cintura', 85, mulher45).rotulo, 'Risco aumentado')
  assert.equal(classificar('rcq', 0.89, homem30).rotulo, 'Adequada')
  assert.equal(classificar('rcq', 0.85, mulher45).rotulo, 'Risco aumentado')
})

test('relação cintura-estatura: 0,5 e 0,6', () => {
  assert.equal(classificar('rcest', 0.49, {}).rotulo, 'Adequada')
  assert.equal(classificar('rcest', 0.5, {}).rotulo, 'Risco aumentado')
  assert.equal(classificar('rcest', 0.6, {}).rotulo, 'Risco muito aumentado')
})

test('pressão: categoria de cada valor + combinada pela maior das duas', () => {
  const ctx = { ...homem30, valores: { pas_repouso: 118, pad_repouso: 92 } }
  const pas = classificar('pas_repouso', 118, ctx)
  assert.equal(pas.rotulo, 'Ótima')
  assert.equal(pas.combinada.rotulo, 'Elevada · faixa 1')
  assert.equal(pas.combinada.diretriz, 'estágio 1')
  assert.match(pas.alerta, /encaminhamento/)
  assert.equal(classificar('pad_repouso', 92, ctx).rotulo, 'Elevada · faixa 1')

  const sozinha = classificar('pas_repouso', 125, homem30)
  assert.equal(sozinha.rotulo, 'Normal')
  assert.equal(sozinha.combinada, null)
  assert.equal(sozinha.alerta, null)
  assert.match(classificar('pas_repouso', 185, homem30).alerta, /antes de seguir com treino intenso/)
})

test('FC de repouso: 60–100 normal, acima avisa', () => {
  assert.equal(classificar('fc_repouso', 55, homem30).rotulo, 'Baixa')
  assert.equal(classificar('fc_repouso', 100, homem30).rotulo, 'Normal')
  const alta = classificar('fc_repouso', 101, homem30)
  assert.equal(alta.rotulo, 'Elevada')
  assert.ok(alta.alerta)
})

test('valor inválido não classifica', () => {
  assert.equal(classificar('imc', '', homem30), null)
  assert.equal(classificar('imc', 0, homem30), null)
})

test('descreverFaixas: texto de laudo com limite exclusivo e fechado', () => {
  const imc = classificar('imc', 22, homem30)
  assert.deepEqual(
    descreverFaixas(imc.faixas, 1).map((f) => f.intervalo),
    ['< 18,5', '18,5 – 24,9', '25,0 – 29,9', '30,0 – 34,9', '35,0 – 39,9', '≥ 40,0']
  )
  const idoso = classificar('imc', 25, { idade: 70 })
  assert.deepEqual(descreverFaixas(idoso.faixas, 1).map((f) => f.intervalo), ['≤ 22,0', '22,1 – 26,9', '≥ 27,0'])
  const fc = classificar('fc_repouso', 70, homem30)
  assert.deepEqual(descreverFaixas(fc.faixas, 0).map((f) => f.intervalo), ['< 60', '60 – 100', '≥ 101'])
})

test('resumoReferencia: uma linha para o tooltip', () => {
  assert.equal(resumoReferencia(classificar('imc', 22, homem30), 1), 'Normal: 18,5 – 24,9 · OMS')
  assert.match(resumoReferencia(classificar('rcq', 0.8, { sexo: null }), 2), /falta sexo/)
})

test('régua: segmentos cortados na escala e posição limitada', () => {
  const imc = classificar('imc', 22, homem30)
  const seg = segmentosRegua(imc.faixas, imc.escala)
  assert.equal(seg[0].de, 0)
  assert.equal(seg.at(-1).ate, 100)
  assert.equal(seg.at(-1).corte, null)
  assert.equal(seg[1].corte, 25)
  assert.equal(posicaoNaEscala(10, imc.escala), 0)
  assert.equal(posicaoNaEscala(60, imc.escala), 100)
  assert.equal(posicaoNaEscala(30, imc.escala), 50)
})

test('variacao: lida pela direção favorável do catálogo', () => {
  assert.deepEqual(variacao(18, 21, 'menor'), { delta: -3, leitura: 'favoravel' })
  assert.deepEqual(variacao(62, 60, 'maior'), { delta: 2, leitura: 'favoravel' })
  assert.equal(variacao(80, 78, 'neutro').leitura, 'neutra')
  assert.equal(variacao(80, 80, 'menor').leitura, 'neutra')
  assert.equal(variacao(80, null, 'menor'), null)
})

test('explicacao: toda métrica do catálogo tem texto (específico ou da categoria)', () => {
  const catalogo = [
    ['peso', 'antropometria'], ['altura', 'antropometria'], ['percentual_gordura', 'composicao'],
    ['massa_gorda', 'composicao'], ['massa_magra', 'composicao'], ['massa_muscular_esqueletica', 'composicao'],
    ['agua_corporal_total', 'composicao'], ['massa_ossea', 'composicao'], ['taxa_metabolica_basal', 'composicao'],
    ['perimetro_pescoco', 'perimetro'], ['perimetro_braco_d', 'perimetro'], ['perimetro_coxa_e', 'perimetro'],
    ['perimetro_panturrilha_d', 'perimetro'], ['dobra_tricipital', 'dobra'], ['dobra_coxa', 'dobra'],
    ['imc', 'indice'], ['rcq', 'indice'], ['rcest', 'indice'], ['vo2max', 'cardio'], ['fc_repouso', 'cardio'],
    ['fc_maxima', 'cardio'], ['pas_repouso', 'cardio'], ['pad_repouso', 'cardio'], ['densidade_corporal', 'composicao']
  ]
  for (const [codigo, categoria] of catalogo) assert.ok(explicacao(codigo, categoria), codigo)
})
