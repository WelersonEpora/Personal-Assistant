"use strict";

const fichaPublicaService = require("../services/ficha-publica.service");
const { success } = require("../shared/utils/api-response");

async function obterFicha(req, res) {
  const ficha = await fichaPublicaService.obterFicha(req.params.token);
  success(res, ficha);
}

async function streamImagem(req, res) {
  const { buffer, mimeType } = await fichaPublicaService.obterImagemDoExercicio(
    req.params.token,
    req.params.exercicioId,
    req.params.posicao
  );
  res.set("Content-Type", mimeType);
  // Imagem de exercício não muda por token - cache curto no cliente ajuda a
  // tela do aluno, sem CDN nem cache compartilhado.
  res.set("Cache-Control", "private, max-age=300");
  res.send(buffer);
}

module.exports = { obterFicha, streamImagem };
