"use strict";

const { Router } = require("express");
const authRoutes = require("./auth.routes");
const alunoRoutes = require("./aluno.routes");
const registroRoutes = require("./registro.routes");
const equipeRoutes = require("./equipe.routes");
const membroRoutes = require("./membro.routes");
const usuarioRoutes = require("./usuario.routes");

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "personal-assistant-backend",
    timestamp: new Date().toISOString()
  });
});

router.use("/api/v1/auth", authRoutes);
router.use("/api/v1/alunos", alunoRoutes);
router.use("/api/v1/registros", registroRoutes);
router.use("/api/v1/equipe", equipeRoutes);
router.use("/api/v1/membros", membroRoutes);
router.use("/api/v1/usuarios", usuarioRoutes);

module.exports = router;
