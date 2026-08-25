"use strict";

const { Router } = require("express");
const authRoutes = require("./auth.routes");
const alunoRoutes = require("./aluno.routes");
const registroRoutes = require("./registro.routes");

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

module.exports = router;
