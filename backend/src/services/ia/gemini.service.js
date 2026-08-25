"use strict";

// Único ponto do sistema que fala com a API do Gemini (docs/adr/0006-
// provedor-ia-gemini.md) - transcrição e interpretação, os dois passos do
// pipeline de docs/adr/0009-processamento-assincrono-em-processo.md.
//
// Deliberadamente mais simples que a camada equivalente do AgroMind (sem
// fallback de 2 chaves, sem retry de erro transitório): MVP, um único
// provedor, sem histórico de instabilidade observada ainda para justificar
// essa complexidade agora.
const { GoogleGenAI } = require("@google/genai");
const env = require("../../config/env");

class GeminiConfigError extends Error {}

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

// Áudio bruto -> texto (Gemini aceita áudio nativamente, ver docs/adr/0006).
// Nunca roda no dispositivo - só aqui, depois da sincronização.
async function transcreverAudio({ buffer, mimeType }) {
  const ai = obterCliente();
  const resposta = await ai.models.generateContent({
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
  const ai = obterCliente();
  const resposta = await ai.models.generateContent({
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

module.exports = { transcreverAudio, interpretarRegistro, GeminiConfigError };
