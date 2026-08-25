"use strict";

const { Router } = require("express");
const alunoController = require("../controllers/aluno.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const router = Router();

router.use(autenticar);

router.get("/", alunoController.list);
router.post("/", alunoController.create);
router.get("/:id", alunoController.getById);
router.put("/:id", alunoController.update);

module.exports = router;
