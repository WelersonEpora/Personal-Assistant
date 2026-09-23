"use strict";

// docs/adr/0024-calculo-percentual-gordura-por-protocolo.md: % de gordura
// CALCULADA pelo service a partir das dobras cutâneas + sexo + idade do aluno
// na data da avaliação. Função pura - o service de CRUD chama; o frontend tem
// um espelho só para o preview (frontend/src/utils/protocolosGordura.js).
//
// Pollock 7 dobras = equações de densidade de Jackson & Pollock (1978, homens)
// e Jackson, Pollock & Ward (1980, mulheres), convertidas em % pelas
// constantes por idade/sexo de Lohman (Siri clássico 4,95/4,50 = homens 20+).
// Conferido contra as 319 avaliações Pollock 7 do BodyMove: 100% com
// diferença < 0,01 ponto - as avaliações novas ficam comparáveis ao histórico.

const DOBRAS_POLLOCK_7 = [
  "dobra_peitoral",
  "dobra_axilar_media",
  "dobra_tricipital",
  "dobra_subescapular",
  "dobra_abdominal",
  "dobra_suprailiaca",
  "dobra_coxa"
];

// Idade mínima: as equações de Jackson & Pollock foram validadas em adultos
// (o BodyMove tem casos a partir de 18). Criança/adolescente -> outro protocolo
// (ex.: Slaughter), digitado.
const IDADE_MINIMA = 17;

function densidadePollock7(soma, sexo, idade) {
  if (sexo === "M") {
    return 1.112 - 0.00043499 * soma + 0.00000055 * soma * soma - 0.00028826 * idade;
  }
  return 1.097 - 0.00046971 * soma + 0.00000056 * soma * soma - 0.00012828 * idade;
}

// Lohman: %G = (a / D - b) * 100
function constantesConversao(sexo, idade) {
  if (sexo === "M") return idade < 20 ? [4.98, 4.53] : [4.95, 4.5];
  return idade < 20 ? [5.05, 4.62] : [5.03, 4.59];
}

const PROTOCOLOS = {
  pollock_7: {
    dobras: DOBRAS_POLLOCK_7,
    densidade: densidadePollock7
  }
};

const PROTOCOLOS_CALCULADOS = Object.keys(PROTOCOLOS);

function positivo(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

// Idade inteira (anos) em `dataRef` (AAAA-MM-DD), sem depender de fuso.
function idadeEm(dataNascimento, dataRef) {
  if (!dataNascimento || !dataRef) return null;
  const [an, mn, dn] = String(dataNascimento).slice(0, 10).split("-").map(Number);
  const [ar, mr, dr] = String(dataRef).slice(0, 10).split("-").map(Number);
  if (![an, mn, dn, ar, mr, dr].every(Number.isFinite)) return null;
  let idade = ar - an;
  if (mr < mn || (mr === mn && dr < dn)) idade -= 1;
  return idade >= 0 && idade < 120 ? idade : null;
}

// `dobras`: { metrica_codigo: valor(mm) }. `sexo`: 'F' | 'M'. `idade`: anos.
// Retorna { densidade, percentual } (sem arredondar) ou { faltando: [...] }
// com o que impede o cálculo - códigos de dobra e/ou 'sexo', 'data_nascimento',
// 'idade_minima'.
function calcularPercentualGordura(protocolo, { dobras = {}, sexo = null, idade = null } = {}) {
  const def = PROTOCOLOS[protocolo];
  if (!def) throw new Error(`Protocolo sem cálculo: ${protocolo}`);

  const faltando = [];
  if (sexo !== "F" && sexo !== "M") faltando.push("sexo");
  if (idade === null || idade === undefined) faltando.push("data_nascimento");
  else if (idade < IDADE_MINIMA) faltando.push("idade_minima");
  for (const codigo of def.dobras) {
    if (!positivo(Number(dobras[codigo]))) faltando.push(codigo);
  }
  if (faltando.length) return { faltando };

  const soma = def.dobras.reduce((t, c) => t + Number(dobras[c]), 0);
  const densidade = def.densidade(soma, sexo, idade);
  const [a, b] = constantesConversao(sexo, idade);
  const percentual = (a / densidade - b) * 100;
  if (!positivo(densidade) || !positivo(percentual)) return { faltando: ["valores_invalidos"] };
  return { densidade, percentual };
}

module.exports = {
  PROTOCOLOS_CALCULADOS,
  DOBRAS_POLLOCK_7,
  IDADE_MINIMA,
  calcularPercentualGordura,
  idadeEm
};
