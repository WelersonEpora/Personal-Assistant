"use strict";

// Único ponto do sistema que fala com a API do Gemini (docs/adr/0006-
// provedor-ia-gemini.md) - transcrição, interpretação e as análises de
// acompanhamento (docs/adr/0015).
//
// Mais simples que a camada equivalente do AgroMind (sem fallback de 2
// chaves), mas COM retry de erro transitório: em produção o provedor devolve
// 503 "high demand / UNAVAILABLE" em rajada em horário de pico, mesmo no
// tier pago (docs/adr/0006).
const { GoogleGenAI } = require("@google/genai");
const env = require("../../config/env");
const logger = require("../../shared/logger");
const { METODOS_VALIDOS } = require("../avaliacao-fisica/metodos");

class GeminiConfigError extends Error {}

const TENTATIVAS_MAX = 3;
const ESPERA_BASE_MS = 1000;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Erro que vale retentar: sobrecarga/indisponibilidade momentânea do
// provedor. Erro de config, schema, prompt ou auth NÃO entra aqui - falha na
// hora.
function ehTransitorio(err) {
  const status = err && (err.status ?? err.code ?? err.response?.status);
  if ([429, 500, 502, 503, 504].includes(Number(status))) return true;
  const texto = `${(err && err.status) || ""} ${(err && err.message) || ""}`.toLowerCase();
  return /unavailable|overloaded|high demand|try again later|deadline exceeded|resource[ _]exhausted|internal error/.test(texto);
}

// Executa `fn` com até `tentativas` tentativas, backoff exponencial + jitter,
// só retentando erro transitório (ver ehTransitorio).
async function comRetry(fn, { tentativas = TENTATIVAS_MAX, esperaBaseMs = ESPERA_BASE_MS } = {}) {
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      return await fn();
    } catch (err) {
      if (tentativa >= tentativas || !ehTransitorio(err)) throw err;
      const espera = esperaBaseMs * 2 ** (tentativa - 1) + Math.floor(Math.random() * 400);
      logger.warn({ tentativa, proxima_em_ms: espera, err: err && err.message }, "[gemini] erro transitório - retry");
      await dormir(espera);
    }
  }
}

// Chamada ao Gemini com retry. Todas as funções abaixo passam por aqui.
function gerarConteudo(params) {
  return comRetry(() => obterCliente().models.generateContent(params));
}

let cliente = null;
function obterCliente() {
  if (!env.gemini.apiKey) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY não configurada - o pipeline de IA (docs/adr/0006-provedor-ia-gemini.md) não pode rodar sem ela."
    );
  }
  if (!cliente) {
    cliente = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  }
  return cliente;
}

const SCHEMA_INTERPRETACAO = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          valor: { type: "string" },
          obs: { type: "string" },
          confidence: { type: "string", enum: ["alta", "media", "baixa"] }
        },
        required: ["label", "valor"]
      }
    },
    notaGeral: { type: "string" }
  },
  required: ["itens"]
};

const INSTRUCAO_INTERPRETACAO = `Você é um assistente que ajuda um personal trainer a estruturar o relato de um atendimento a um aluno.
Considere APENAS as informações fornecidas abaixo, na ordem em que foram capturadas (podem ser áudios transcritos e textos digitados). NUNCA invente informação que não esteja presente no conteúdo.
Extraia uma lista de itens (ex.: exercícios realizados, medidas de avaliação física, observações relevantes), cada um com:
- "label": nome curto do item (ex.: "Agachamento", "Braço direito").
- "valor": o dado principal associado (ex.: "4 × 10 — 30 kg", "34 cm").
- "obs": observação relevante associada a este item específico, ou string vazia se não houver.
- "confidence": "alta" quando o dado é explícito e sem ambiguidade no texto, "media" quando há alguma inferência razoável, "baixa" quando é incerto.
Se houver uma observação geral do relato que não pertence a um item específico, coloque em "notaGeral" (string vazia se não houver).
Se não houver nada estruturável no conteúdo, devolva "itens" como lista vazia.`;

// docs/adr/0015-acompanhamento-individual-mensal.md: avaliação mensal do
// aluno. Duas partes na mesma resposta - a avaliação voltada para o personal
// e o contexto consolidado (compacto) que alimenta o próximo ciclo. Toda
// lista é array de objetos rasos: fácil de validar via responseSchema e de
// renderizar, e mantém o contexto pequeno (o prompt instrui a limitar).
const NIVEL_CONFIANCA = { type: "string", enum: ["alta", "media", "baixa"] };
const TIPO_INFORMACAO = { type: "string", enum: ["fato", "interpretacao", "hipotese"] };

// Persona comum das análises de acompanhamento (mensal e sob demanda,
// docs/adr/0015). A IA é apoio técnico à análise do profissional - nunca
// substitui a decisão dele, nunca só concorda para agradar.
const PERSONA_PERSONAL_SENIOR = `Você atua como um PERSONAL TRAINER SÊNIOR, com experiência prática e conhecimento técnico atual em treinamento de força e condicionamento, fisiologia do exercício, biomecânica, recuperação, e adesão/comportamento do aluno.

Sua postura:
- Analise criticamente os dados: identifique padrões, evolução, inconsistências e pontos de atenção.
- NÃO tente agradar nem simplesmente concordar com o profissional. Se os dados apontam outra direção, diga.
- Deixe explícito quando os dados são insuficientes para uma conclusão - não force uma resposta.
- Diferencie sempre FATO OBSERVADO (dito claramente em um relato), INTERPRETAÇÃO (sua conclusão a partir dos relatos) e HIPÓTESE (possibilidade ainda não confirmada).
- NUNCA invente informações, números, exercícios ou fatos que não estejam no conteúdo fornecido.
- Você é APOIO TÉCNICO à análise do profissional, não substituto da decisão dele.`;

const SCHEMA_AVALIACAO_MENSAL = {
  type: "object",
  properties: {
    avaliacao_mensal: {
      type: "object",
      properties: {
        periodo: {
          type: "object",
          properties: {
            ano_mes: { type: "string" },
            inicio: { type: "string" },
            fim: { type: "string" }
          },
          required: ["ano_mes"]
        },
        dados_insuficientes: { type: "boolean" },
        relatos_considerados: { type: "integer" },
        resumo_geral: { type: "string" },
        dimensoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nome: { type: "string" },
              situacao_atual: { type: "string" },
              evolucao_no_mes: { type: "string" },
              evidencias: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    texto: { type: "string" },
                    origem: { type: "string" },
                    data: { type: "string" }
                  },
                  required: ["texto"]
                }
              },
              confianca: NIVEL_CONFIANCA
            },
            required: ["nome", "situacao_atual", "evolucao_no_mes", "confianca"]
          }
        },
        destaques: { type: "array", items: { type: "string" } },
        alertas: {
          type: "array",
          items: {
            type: "object",
            properties: { texto: { type: "string" }, gravidade: NIVEL_CONFIANCA },
            required: ["texto"]
          }
        },
        recomendacoes: { type: "array", items: { type: "string" } },
        pendencias_confirmacao: {
          type: "array",
          items: {
            type: "object",
            properties: {
              afirmacao: { type: "string" },
              motivo: { type: "string" },
              confianca: NIVEL_CONFIANCA
            },
            required: ["afirmacao"]
          }
        },
        mudancas_vs_mes_anterior: { type: "array", items: { type: "string" } }
      },
      required: ["periodo", "dados_insuficientes", "relatos_considerados", "resumo_geral", "dimensoes"]
    },
    contexto_consolidado: {
      type: "object",
      properties: {
        aluno_id: { type: "string" },
        gerado_em: { type: "string" },
        cobre_ate: { type: "string" },
        linha_de_base: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rotulo: { type: "string" },
              valor: { type: "string" },
              tipo: TIPO_INFORMACAO,
              origem: { type: "string" },
              confianca: NIVEL_CONFIANCA,
              atualizado_em: { type: "string" }
            },
            required: ["rotulo", "valor", "tipo"]
          }
        },
        estado_atual: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dimensao: { type: "string" },
              situacao: { type: "string" },
              tipo: TIPO_INFORMACAO,
              origem: { type: "string" },
              confianca: NIVEL_CONFIANCA,
              atualizado_em: { type: "string" }
            },
            required: ["dimensao", "situacao", "tipo"]
          }
        },
        evolucao_relevante: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dimensao: { type: "string" },
              trajetoria: { type: "string" },
              confianca: NIVEL_CONFIANCA
            },
            required: ["dimensao", "trajetoria"]
          }
        },
        marcos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              data: { type: "string" },
              evento: { type: "string" },
              origem: { type: "string" }
            },
            required: ["evento"]
          }
        },
        hipoteses_abertas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hipotese: { type: "string" },
              confianca: NIVEL_CONFIANCA,
              desde: { type: "string" },
              status: { type: "string" },
              ciclos_sem_reforco: { type: "integer" }
            },
            required: ["hipotese"]
          }
        },
        lacunas: { type: "array", items: { type: "string" } }
      },
      required: [
        "aluno_id",
        "gerado_em",
        "cobre_ate",
        "linha_de_base",
        "estado_atual",
        "evolucao_relevante",
        "marcos",
        "hipoteses_abertas",
        "lacunas"
      ]
    }
  },
  required: ["avaliacao_mensal", "contexto_consolidado"]
};

const INSTRUCAO_AVALIACAO_MENSAL = `${PERSONA_PERSONAL_SENIOR}

Sua tarefa agora: acompanhar a evolução de UM aluno ao longo do tempo e fechar o mês.

Pergunta central que a avaliação precisa responder:
"O que os novos relatos deste mês, considerando o que já sabemos sobre o aluno, permitem concluir sobre a evolução dele?"

Você recebe estes blocos:
1. CONTEXTO CONSOLIDADO - o que se sabia sobre o aluno até o fim do mês anterior (pode não existir, se for o primeiro ciclo).
2. RELATOS CONFIRMADOS DO MÊS - os relatos que o personal revisou e confirmou neste mês, na ordem de confirmação.
3. AVALIAÇÃO DO PERSONAL - texto escrito pelo próprio profissional neste mês (pode não existir).

Regras obrigatórias:
- Use APENAS o que está nos blocos. NUNCA invente dados, números, exercícios ou fatos.
- A AVALIAÇÃO DO PERSONAL é a leitura do próprio profissional: tem peso alto e pode corrigir ou derrubar hipóteses do contexto anterior, e até relativizar o que os relatos sugerem. Ainda assim é um insumo a integrar (origem "personal:<id>"), não um texto para copiar - concilie com os relatos e, se a avaliação do personal divergir do que os relatos mostram, registre isso em "alertas" ou "mudancas_vs_mes_anterior".
- Diferencie sempre: FATO OBSERVADO (dito claramente em um relato), INTERPRETAÇÃO (conclusão sua a partir dos relatos) e HIPÓTESE (possibilidade ainda não confirmada). No contexto consolidado, marque cada item em "tipo" como "fato", "interpretacao" ou "hipotese".
- O CONTEXTO CONSOLIDADO do mês anterior é memória de trabalho, NÃO é verdade absoluta: trate seus itens como hipóteses a revalidar contra os novos relatos. Novo relato que confirma -> mantenha/eleve a confiança. Novo relato que contradiz -> atualize e registre em "mudancas_vs_mes_anterior". Nada novo reforça e a confiança era baixa -> rebaixe ou mova para "pendencias_confirmacao".
- Rastreabilidade: preencha "origem" com o identificador do relato de onde a informação veio (ex.: "relato:UUID"), ou "contexto" se veio do contexto anterior, ou "interpretacao" se é conclusão sua.
- Sinalize contradições (entre relatos, ou entre um relato e o contexto anterior) de forma explícita, em "alertas" ou "pendencias_confirmacao".
- A avaliação é uma INTERPRETAÇÃO sua e NUNCA deve ser tratada como dado oficial do aluno.

Sobre o CONTEXTO CONSOLIDADO que você deve produzir (será a entrada do próximo ciclo):
- COMPACTO e ESTRUTURADO. Não acumule avaliações anteriores nem repita o histórico mês a mês.
- "linha_de_base": fatos estáveis do aluno (objetivos, restrições de saúde, histórico de lesões, preferências). Muda pouco entre ciclos.
- "estado_atual": a situação mais recente conhecida por dimensão (força, condicionamento, adesão, dor/limitações, medidas etc.).
- "evolucao_relevante": só as tendências que importam para entender a trajetória. Resumidas, não uma lista por mês.
- "marcos": eventos datados pontuais (lesão, mudança de objetivo, retorno de afastamento, viagem).
- "hipoteses_abertas": o que ainda falta confirmar. Incremente "ciclos_sem_reforco" a cada ciclo sem nova evidência; descarte o que ficar obsoleto.
- "lacunas": informações importantes que estão faltando.
- Limite cada lista aos itens realmente relevantes (por volta de 8 no máximo). Consolide ou descarte o resto.

Se "dados_insuficientes" for true: mantenha a avaliação curta, NÃO infira tendências e altere o contexto consolidado o mínimo possível.`;

// Contexto (contexto anterior + relatos do mês, já montado como texto) ->
// { avaliacaoMensal, contextoConsolidado }. Saída estruturada força o
// contrato das duas partes.
async function gerarAvaliacaoMensal({ promptContexto }) {
  const resposta = await gerarConteudo({
    model: env.gemini.model,
    contents: [{ role: "user", parts: [{ text: `${INSTRUCAO_AVALIACAO_MENSAL}\n\n---\n${promptContexto}` }] }],
    config: { responseMimeType: "application/json", responseSchema: SCHEMA_AVALIACAO_MENSAL }
  });

  const bruto = JSON.parse(resposta.text);
  return {
    avaliacaoMensal: bruto.avaliacao_mensal || null,
    contextoConsolidado: bruto.contexto_consolidado || null
  };
}

// docs/adr/0015: análise sob demanda - a pedido do profissional, fora do
// ciclo mensal. NÃO produz nem altera o contexto consolidado (por isso não
// tem a parte "contexto_consolidado" do schema mensal). Só uma leitura
// pontual do momento do aluno.
const SCHEMA_ANALISE_SOB_DEMANDA = {
  type: "object",
  properties: {
    analise: {
      type: "object",
      properties: {
        dados_insuficientes: { type: "boolean" },
        relatos_considerados: { type: "integer" },
        resumo_geral: { type: "string" },
        dimensoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nome: { type: "string" },
              situacao_atual: { type: "string" },
              evolucao_recente: { type: "string" },
              evidencias: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    texto: { type: "string" },
                    origem: { type: "string" },
                    data: { type: "string" }
                  },
                  required: ["texto"]
                }
              },
              confianca: NIVEL_CONFIANCA
            },
            required: ["nome", "situacao_atual", "evolucao_recente", "confianca"]
          }
        },
        destaques: { type: "array", items: { type: "string" } },
        alertas: {
          type: "array",
          items: {
            type: "object",
            properties: { texto: { type: "string" }, gravidade: NIVEL_CONFIANCA },
            required: ["texto"]
          }
        },
        recomendacoes: { type: "array", items: { type: "string" } },
        pendencias_confirmacao: {
          type: "array",
          items: {
            type: "object",
            properties: {
              afirmacao: { type: "string" },
              motivo: { type: "string" },
              confianca: NIVEL_CONFIANCA
            },
            required: ["afirmacao"]
          }
        }
      },
      required: ["dados_insuficientes", "relatos_considerados", "resumo_geral", "dimensoes"]
    }
  },
  required: ["analise"]
};

const INSTRUCAO_ANALISE_SOB_DEMANDA = `${PERSONA_PERSONAL_SENIOR}

Sua tarefa agora: uma ANÁLISE PONTUAL, solicitada pelo profissional fora do ciclo mensal.

Você recebe:
1. CONTEXTO CONSOLIDADO - o que se sabe sobre o aluno até o último fechamento mensal (pode não existir).
2. RELATOS CONFIRMADOS RECENTES - relatos confirmados ainda não incorporados a um fechamento mensal.
3. AVALIAÇÃO DO PERSONAL - texto do profissional ainda não incorporado a um fechamento mensal (pode não existir).

Pergunta central: "Considerando o que já se sabe sobre o aluno, o que os relatos recentes e a avaliação do personal indicam sobre o momento atual e a evolução dele?"

Regras:
- Use APENAS o contexto, os relatos e a avaliação do personal fornecidos.
- A AVALIAÇÃO DO PERSONAL é a leitura do próprio profissional: peso alto, pode relativizar o contexto e os relatos. Integre-a (origem "personal:<id>"), não a copie, e aponte divergências entre ela e os relatos.
- Trate o CONTEXTO CONSOLIDADO como referência a confrontar com os relatos recentes, não como verdade absoluta. Aponte contradições explicitamente (em "alertas" ou "pendencias_confirmacao").
- Rastreabilidade: "origem" = identificador do relato ("relato:UUID"), "contexto" ou "interpretacao".
- Esta análise é um APOIO pontual: NÃO é dado oficial e NÃO altera o contexto consolidado do ciclo mensal.
- Se houver poucos relatos recentes, marque "dados_insuficientes" como true, mantenha a análise curta e não infira tendências.`;

// Contexto (contexto consolidado mais recente + relatos recentes, já montado
// como texto) -> { analise }. Não devolve contexto consolidado: a análise
// sob demanda nunca alimenta o ciclo mensal.
async function gerarAnaliseSobDemanda({ promptContexto }) {
  const resposta = await gerarConteudo({
    model: env.gemini.model,
    contents: [{ role: "user", parts: [{ text: `${INSTRUCAO_ANALISE_SOB_DEMANDA}\n\n---\n${promptContexto}` }] }],
    config: { responseMimeType: "application/json", responseSchema: SCHEMA_ANALISE_SOB_DEMANDA }
  });

  const bruto = JSON.parse(resposta.text);
  return { analise: bruto.analise || null };
}

// Áudio bruto -> texto (Gemini aceita áudio nativamente, ver docs/adr/0006).
// Nunca roda no dispositivo - só aqui, depois da sincronização.
async function transcreverAudio({ buffer, mimeType }) {
  const resposta = await gerarConteudo({
    model: env.gemini.model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: buffer.toString("base64") } },
          {
            text: "Transcreva literalmente, em português do Brasil, o áudio a seguir. Devolva apenas o texto transcrito, sem comentários adicionais nem pontuação de cabeçalho."
          }
        ]
      }
    ]
  });

  return (resposta.text || "").trim();
}

// Contexto consolidado (texto + transcrições, ordem original) -> JSON
// estruturado. Saída estruturada (responseSchema) força o contrato
// itens[]/notaGeral em vez de depender só do prompt.
async function interpretarRegistro({ contextoConsolidado }) {
  const resposta = await gerarConteudo({
    model: env.gemini.model,
    contents: [
      {
        role: "user",
        parts: [{ text: `${INSTRUCAO_INTERPRETACAO}\n\n---\nConteúdo do Registro (na ordem de captura):\n${contextoConsolidado}` }]
      }
    ],
    config: { responseMimeType: "application/json", responseSchema: SCHEMA_INTERPRETACAO }
  });

  const bruto = JSON.parse(resposta.text);
  return {
    itens: Array.isArray(bruto.itens) ? bruto.itens : [],
    notaGeral: typeof bruto.notaGeral === "string" ? bruto.notaGeral : ""
  };
}

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: interpretador ESPECÍFICO
// da avaliação física ditada. Separado de interpretarRegistro - a saída é o
// catálogo fechado de métricas v3 (docs/adr/0016), não a lista semiestruturada
// de itens. NUNCA calcula protocolo de % de gordura (Pollock etc.), IMC, RCQ
// nem massas, e NUNCA inventa metrica_codigo (o que não encaixa vai para
// nao_mapeado). O resultado é uma PROPOSTA - nunca dado oficial (docs/adr/0007).
const SCHEMA_AVALIACAO_FISICA_IA = {
  type: "object",
  properties: {
    data_ouvida: { type: "string" },
    medidas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metrica_codigo: { type: "string" },
          metodo: { type: "string" },
          valor: { type: "number" },
          unidade_ouvida: { type: "string" },
          principal: { type: "boolean" },
          confianca: { type: "string", enum: ["alta", "media", "baixa"] },
          trecho_origem: { type: "string" }
        },
        required: ["metrica_codigo", "valor", "confianca"]
      }
    },
    observacoes: { type: "string" },
    nao_mapeado: {
      type: "array",
      items: {
        type: "object",
        properties: { trecho: { type: "string" }, motivo: { type: "string" } },
        required: ["trecho"]
      }
    }
  },
  required: ["medidas"]
};

// catalogo: linhas de metrica_avaliacao_fisica (codigo/rotulo/categoria/
// unidade/casas_decimais/ativo) -> bloco de texto para o prompt.
function montarCatalogoParaPrompt(catalogo) {
  return catalogo
    .filter((m) => m.ativo)
    .map((m) => `- ${m.codigo} · ${m.rotulo} · ${m.categoria} · unidade canônica: ${m.unidade} · ${m.casas_decimais} casa(s) decimais`)
    .join("\n");
}

const INSTRUCAO_INTERPRETACAO_AVALIACAO_FISICA = `Você ajuda um personal trainer a estruturar as MEDIDAS que ele ditou durante uma avaliação física.
Considere APENAS o que foi dito abaixo (áudios transcritos e/ou textos, na ordem de captura). NUNCA invente número, medida ou método.

Para cada medida identificada, devolva um item em "medidas" com:
- "metrica_codigo": obrigatoriamente um código EXATO do catálogo abaixo. Se o que foi dito não corresponder a nenhuma métrica do catálogo, NÃO invente - registre em "nao_mapeado".
- "valor": número na UNIDADE CANÔNICA da métrica (ver catálogo). Se o personal disse outra unidade, converta e registre o que foi dito em "unidade_ouvida".
- "metodo": "direto" por padrão. Para % de gordura ou VO2, use o método citado se houver; um dos: {METODOS}.
- "principal": true para o valor a acompanhar quando houver mais de um método para a mesma métrica; caso contrário true.
- "confianca": "alta" quando o dado é explícito e sem ambiguidade; "media" quando houve inferência razoável; "baixa" quando ficou incerto (qual dobra? mm ou cm? valor único ou média de 3?).
- "trecho_origem": a parte da fala de onde a medida foi tirada.

Regras obrigatórias:
- NÃO calcule % de gordura, VO2, IMC, RCQ nem massas a partir de dobras/perímetros. Registre SÓ o que foi dito como valor - o sistema calcula os índices depois.
- "data_ouvida" (AAAA-MM-DD) só se a data da avaliação foi dita explicitamente; caso contrário "".
- "observacoes": comentário geral do personal que não é uma medida (string vazia se não houver).
- "nao_mapeado": lista de objetos { "trecho", "motivo" } para o que foi dito e não virou medida.
- Se não houver nada estruturável, devolva "medidas" como lista vazia.

CATÁLOGO DE MÉTRICAS (use apenas estes "metrica_codigo"):
{CATALOGO}`;

// Contexto consolidado (texto + transcrições, ordem original) + catálogo de
// métricas -> proposta estruturada de avaliação física.
async function interpretarAvaliacaoFisica({ contextoConsolidado, catalogo }) {
  const instrucao = INSTRUCAO_INTERPRETACAO_AVALIACAO_FISICA.replace("{METODOS}", METODOS_VALIDOS.join(", ")).replace(
    "{CATALOGO}",
    montarCatalogoParaPrompt(catalogo)
  );

  const resposta = await gerarConteudo({
    model: env.gemini.model,
    contents: [
      {
        role: "user",
        parts: [{ text: `${instrucao}\n\n---\nConteúdo do Registro (na ordem de captura):\n${contextoConsolidado}` }]
      }
    ],
    config: { responseMimeType: "application/json", responseSchema: SCHEMA_AVALIACAO_FISICA_IA }
  });

  const bruto = JSON.parse(resposta.text);
  return {
    dataOuvida: typeof bruto.data_ouvida === "string" ? bruto.data_ouvida : "",
    medidas: Array.isArray(bruto.medidas) ? bruto.medidas : [],
    observacoes: typeof bruto.observacoes === "string" ? bruto.observacoes : "",
    naoMapeado: Array.isArray(bruto.nao_mapeado) ? bruto.nao_mapeado : []
  };
}

// docs/adr/0022-radar-atualizacao-profissional.md: a "fofoqueira científica".
// UMA chamada com Google Search grounding - a IA vigia as fontes da allowlist
// e avisa quando acha algo que pode interessar a um personal. NÃO usa
// responseSchema (incompatível com googleSearch no Gemini): o prompt pede um
// array JSON e o parse é tolerante (descarta o malformado depois, no service).
// A IA aqui NÃO é autoridade - ela aponta, o personal vai à fonte.
const INSTRUCAO_RADAR = `Você vigia um conjunto FIXO de fontes científicas confiáveis e avisa um PERSONAL TRAINER quando aparece uma publicação que pode merecer a atenção dele.

Você NÃO é autoridade científica. Seu papel é APONTAR, não concluir. O personal sempre vai abrir a fonte original e tirar as próprias conclusões.

Regras obrigatórias:
- Use APENAS as fontes listadas abaixo. Se a publicação não vier de uma delas, NÃO inclua.
- Considere apenas o período informado (janela de busca). Publicações fora da janela não entram.
- Faça várias buscas nas fontes permitidas para cobrir bem os assuntos. Devolva TODAS as publicações realmente relevantes da janela, até o limite de {MAX_ITENS}. Se de fato não houver nada relevante, devolva [] - mas antes de desistir, tente outras buscas.
- "url": link DIRETO para a fonte primária (a página do artigo/documento no domínio da fonte, ou um doi.org). Nunca um blog, agregador ou release de imprensa. Se não tiver certeza de que o link é real e direto, NÃO inclua o item.
- "resumo": o que o documento diz, segundo o abstract ou a própria página. NÃO interprete além disso, não extrapole, não dê números fora de contexto.
- "motivo_relevancia": por que isso pode interessar a um personal. SEM superlativo ("é uma revisão sistemática sobre frequência de treino", nunca "estudo que muda tudo").
- NUNCA invente publicação, autor, periódico ou data.
- NÃO pare no PubMed: faça buscas específicas nas fontes brasileiras da lista (SciELO, CBCE, SBMEE, Ministério da Saúde) e verifique mudanças regulatórias do CONFEF/CREF. Traga o que for relevante delas, mesmo que a maior parte dos resultados venha de fontes internacionais.
- Se a publicação que você encontrou JÁ ESTÁ na lista "JÁ NO RADAR" abaixo, NÃO a inclua - nem com o título reescrito, nem com outra URL (doi.org vs pubmed etc.). Confira por assunto/autores, não só pelo texto exato do título.

Devolva SOMENTE um array JSON (sem texto em volta), cada item com:
- "titulo": título claro em português do Brasil (pode traduzir o original).
- "fonte": nome da fonte/veículo (ex.: "British Journal of Sports Medicine").
- "url": link direto (ver regra acima).
- "tipo": um de "diretriz", "position_stand", "revisao_sistematica", "meta_analise", "estudo_primario", "consenso", "outro".
- "data_informada": data de publicação como você a encontrou (texto livre, ""  se não souber).
- "resumo": 2 a 4 frases (ver regra acima).
- "motivo_relevancia": 1 a 2 frases (ver regra acima).
- "assuntos": lista com 1 a 3 dos assuntos de interesse abaixo aos quais o item se encaixa.`;

function montarPromptRadar({ assuntos, fontes, janela, criterios, maxItens, jaPublicados = [], foco = null }) {
  const blocoFontes = fontes.map((f) => `- ${f.nome} (${f.dominio})`).join("\n");
  const blocoAssuntos = assuntos.map((a) => `- ${a}`).join("\n");
  const blocoCriterios = criterios.map((c) => `- ${c}`).join("\n");
  const partes = [
    INSTRUCAO_RADAR.replace("{MAX_ITENS}", String(maxItens)),
    "",
    foco ? `FOCO DESTA BUSCA: ${foco}` : null,
    `JANELA DE BUSCA: de ${janela.de} a ${janela.ate} (datas AAAA-MM-DD).`,
    "",
    "FONTES PERMITIDAS (use apenas estas):",
    blocoFontes,
    "",
    "ASSUNTOS DE INTERESSE:",
    blocoAssuntos,
    "",
    "CRITÉRIOS DE RELEVÂNCIA:",
    blocoCriterios
  ];
  if (jaPublicados.length) {
    partes.push(
      "",
      "JÁ NO RADAR (NÃO devolva nenhuma destas publicações de novo):",
      jaPublicados.map((p) => `- ${p.titulo} (${p.url})`).join("\n")
    );
  }
  return partes.filter((p) => p !== null).join("\n");
}

// Extrai o primeiro array JSON de um texto - tolera bloco cercado ```json,
// texto em volta e "quase-JSON" no entorno. Retorna null se nada parsear.
function extrairPrimeiroArrayJson(texto) {
  if (!texto || typeof texto !== "string") return null;
  const candidatos = [];
  const cercado = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cercado) candidatos.push(cercado[1]);
  candidatos.push(texto);
  for (const candidato of candidatos) {
    const inicio = candidato.indexOf("[");
    const fim = candidato.lastIndexOf("]");
    if (inicio === -1 || fim === -1 || fim < inicio) continue;
    try {
      const parsed = JSON.parse(candidato.slice(inicio, fim + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch (_err) {
      // tenta o próximo candidato
    }
  }
  return null;
}

// Teto por chamada - Pro + Google Search grounding é lento (dezenas de
// segundos a minutos). Estoura -> AbortError, não transitório, o service
// pula esse grupo (docs/adr/0022, adendo 5). Um ciclo com 4 grupos pode
// levar minutos; o job roda unref'd, ninguém espera.
const RADAR_TIMEOUT_MS = 4 * 60 * 1000;

async function buscarRadar({ assuntos, fontes, janela, criterios, maxItens, jaPublicados = [], foco = null }) {
  const modelo = env.radar.model || env.gemini.model;
  const prompt = montarPromptRadar({ assuntos, fontes, janela, criterios, maxItens, jaPublicados, foco });

  const resposta = await gerarConteudo({
    model: modelo,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { tools: [{ googleSearch: {} }], abortSignal: AbortSignal.timeout(RADAR_TIMEOUT_MS) }
  });

  const respostaCrua = resposta.text || "";
  const bruto = extrairPrimeiroArrayJson(respostaCrua);
  return {
    itens: Array.isArray(bruto) ? bruto : [],
    promptUsado: prompt,
    respostaCrua,
    modelo
  };
}

module.exports = {
  transcreverAudio,
  interpretarRegistro,
  interpretarAvaliacaoFisica,
  gerarAvaliacaoMensal,
  gerarAnaliseSobDemanda,
  buscarRadar,
  GeminiConfigError,
  // exportados para teste
  comRetry,
  ehTransitorio,
  montarCatalogoParaPrompt,
  montarPromptRadar,
  extrairPrimeiroArrayJson
};
