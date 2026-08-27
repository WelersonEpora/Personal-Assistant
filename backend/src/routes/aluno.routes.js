"use strict";

const { Router } = require("express");
const multer = require("multer");
const alunoController = require("../controllers/aluno.controller");
const fichaTreinoController = require("../controllers/ficha-treino.controller");
const fichaAcessoLinkController = require("../controllers/ficha-acesso-link.controller");
const avaliacaoMensalController = require("../controllers/avaliacao-mensal.controller");
const analiseSobDemandaController = require("../controllers/analise-sob-demanda.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.use(autenticar);

router.get("/", alunoController.list);
router.post("/", alunoController.create);
router.get("/:id", alunoController.getById);
router.put("/:id", alunoController.update);
router.delete("/:id", alunoController.excluir);
router.post("/:id/foto", upload.single("foto"), alunoController.enviarFoto);
router.get("/:id/foto", alunoController.streamFoto);
router.delete("/:id/foto", alunoController.removerFoto);

// Ficha de treino (docs/adr/0013) - área operacional do personal, aninhada
// no aluno; consulta avulsa de uma ficha específica vive em
// ficha-treino.routes.js (/api/v1/fichas-treino/:id).
router.get("/:id/fichas-treino", fichaTreinoController.listarPorAluno);
router.get("/:id/fichas-treino/ativa", fichaTreinoController.obterAtiva);
router.post("/:id/fichas-treino", fichaTreinoController.criar);

// Link temporário de acesso do aluno à ficha ativa (docs/adr/0014) - somente
// leitura, sem login. GET devolve o link atual (com o token, p/ recopiar);
// POST gera um novo (revogando o anterior); DELETE revoga.
router.get("/:id/ficha-link", fichaAcessoLinkController.obter);
router.post("/:id/ficha-link", fichaAcessoLinkController.gerar);
router.delete("/:id/ficha-link", fichaAcessoLinkController.revogar);

// Acompanhamento Individual Mensal (docs/adr/0015) - avaliação da IA sobre a
// evolução do aluno no mês; nunca é dado oficial. Sem etapa de validação:
// para corrigir, o personal registra um novo relato. `:anoMes` no formato
// "YYYY-MM"; POST .../gerar gera ou regenera (sobrescreve) o mês.
router.get("/:id/avaliacoes-mensais", avaliacaoMensalController.listarPorAluno);
router.get("/:id/avaliacoes-mensais/:anoMes", avaliacaoMensalController.obterPorMes);
router.post("/:id/avaliacoes-mensais/:anoMes/gerar", avaliacaoMensalController.gerar);

// Análise sob demanda (docs/adr/0015) - leitura pontual da IA a pedido do
// personal, no máximo 1 gerada a cada 7 dias por aluno. Não altera o
// contexto consolidado do ciclo mensal. GET traz o histórico + a
// disponibilidade (quando a próxima estará liberada).
router.get("/:id/analises-sob-demanda", analiseSobDemandaController.listar);
router.post("/:id/analises-sob-demanda", analiseSobDemandaController.solicitar);

module.exports = router;
