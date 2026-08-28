"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §3.4):
// IMC e RCQ são métricas `calculado` - propriedade do service, nunca escritas
// direto por um humano. São (re)calculadas a partir de outras medidas da
// MESMA avaliação e ficam ARMAZENADAS (não só na leitura), para o gráfico e a
// comparação as tratarem como qualquer outra métrica.
//
// Esta função é pura e reutilizável: o importador do legado, o service de CRUD
// (na transação de gravação) e o script de backfill chamam a mesma função.
//
// Derivadas: `imc`, `rcq`, `massa_gorda`, `massa_magra`. `massa_magra` depende
// de `massa_gorda` (calculada logo antes), por isso `calcularDerivadas`
// realimenta o mapa de entrada a cada derivada resolvida. `rcest` e
// `massa_muscular_esqueletica` (≠ massa magra) NÃO são derivadas - a lista
// DERIVACOES abaixo é o ponto de extensão.

function arredondar(valor, casas) {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

function positivo(valor) {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}

const DERIVACOES = [
  {
    metrica_codigo: "imc",
    casas: 1,
    // entradas na unidade canônica do catálogo: peso em kg, altura em cm.
    calcular: (m) => {
      if (!positivo(m.peso) || !positivo(m.altura)) return null;
      const alturaM = m.altura / 100;
      return m.peso / (alturaM * alturaM);
    }
  },
  {
    metrica_codigo: "rcq",
    casas: 2,
    calcular: (m) => {
      if (!positivo(m.perimetro_cintura) || !positivo(m.perimetro_quadril)) return null;
      return m.perimetro_cintura / m.perimetro_quadril;
    }
  },
  {
    // modelo 2-compartimentos, a partir da % de gordura ACOMPANHADA (principal)
    metrica_codigo: "massa_gorda",
    casas: 1,
    calcular: (m) => {
      if (!positivo(m.peso) || !positivo(m.percentual_gordura)) return null;
      return (m.peso * m.percentual_gordura) / 100;
    }
  },
  {
    metrica_codigo: "massa_magra",
    casas: 1,
    // usa `massa_gorda` recém-derivada (realimentada no mapa por calcularDerivadas)
    calcular: (m) => {
      if (!positivo(m.peso) || !positivo(m.massa_gorda)) return null;
      const magra = m.peso - m.massa_gorda;
      return magra > 0 ? magra : null;
    }
  }
];

// `medidasPrincipais`: mapa { metrica_codigo: valorNumerico } com as medidas
// `principal` da avaliação. Retorna as medidas derivadas a inserir (nunca
// altera a entrada). Entrada faltando -> métrica simplesmente não sai (série
// esparsa, proposta v3 §3.4).
function calcularDerivadas(medidasPrincipais) {
  const entrada = {};
  for (const [codigo, valor] of Object.entries(medidasPrincipais || {})) {
    entrada[codigo] = typeof valor === "string" ? Number(valor) : valor;
  }

  const derivadas = [];
  for (const def of DERIVACOES) {
    const bruto = def.calcular(entrada);
    if (bruto === null || !Number.isFinite(bruto)) continue;
    const valor = arredondar(bruto, def.casas);
    // realimenta o mapa - derivadas seguintes (ex.: massa_magra) podem usar
    entrada[def.metrica_codigo] = valor;
    derivadas.push({
      metrica_codigo: def.metrica_codigo,
      metodo: "direto",
      principal: true,
      valor,
      origem_valor: "calculado"
    });
  }
  return derivadas;
}

// Códigos que o service calcula sozinho - a API rejeita POST/PUT de medida
// com um destes `metrica_codigo` (proposta v3 §3.4).
const DERIVADAS = DERIVACOES.map((d) => d.metrica_codigo);

module.exports = { calcularDerivadas, arredondar, DERIVADAS };
