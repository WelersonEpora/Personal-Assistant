"use strict";

const { Router } = require("express");
const multer = require("multer");
const alunoController = require("../controllers/aluno.controller");
const fichaTreinoController = require("../controllers/ficha-treino.controller");
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

module.exports = router;
