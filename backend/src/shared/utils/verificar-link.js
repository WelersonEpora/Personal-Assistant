"use strict";

// docs/adr/0022-radar-atualizacao-profissional.md: verificação de link do
// Radar. Não é appraisal de conteúdo, só "esse endereço serve?".
//
//   'ok'             -> 2xx / 3xx
//   'quebrado'       -> a página não existe: 404/410, ou DNS não resolve
//                       (domínio provavelmente alucinado), ou URL malformada
//                       => NÃO publica
//   'nao_verificado' -> não deu para confirmar, mas o alvo provavelmente
//                       existe: 401/403/405/429/5xx, timeout, conexão
//                       recusada/resetada, TLS. Publica COM o selo "link não
//                       verificado" - o personal vai à fonte de qualquer jeito.
//
// A distinção importa para conteúdo brasileiro: sites de conselho/governo
// (confef.org.br, gov.br) costumam barrar bot -> `fetch failed`, que NÃO é
// "página morta". Só DNS-não-resolve (ENOTFOUND) vira `quebrado`.
const logger = require("../logger");

const TIMEOUT_MS = 8000;
const QUEBRADO_STATUS = new Set([404, 410]);
const DNS_ERROS = new Set(["ENOTFOUND", "EAI_FAIL"]);

async function verificarLink(url) {
  let alvo;
  try {
    alvo = new URL(url);
  } catch (_err) {
    return "quebrado";
  }
  if (alvo.protocol !== "http:" && alvo.protocol !== "https:") {
    return "quebrado";
  }

  try {
    const resposta = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "PersonalAssistantRadar/1.0 (+link-check)" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (resposta.ok) return "ok";
    if (QUEBRADO_STATUS.has(resposta.status)) return "quebrado";
    if (resposta.status >= 300 && resposta.status < 400) return "ok";
    return "nao_verificado";
  } catch (err) {
    const causa = err && err.cause && err.cause.code;
    logger.warn({ url, causa, err: err && err.message }, "[radar] link não verificável");
    // DNS não resolve => domínio provavelmente não existe (alucinação).
    if (DNS_ERROS.has(causa)) return "quebrado";
    // timeout, conexão recusada/resetada, TLS, bot bloqueado... o alvo
    // provavelmente existe; publica com o selo.
    return "nao_verificado";
  }
}

module.exports = { verificarLink };
