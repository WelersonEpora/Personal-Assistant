"use strict";

const { Router } = require("express");
const membroController = require("../controllers/membro.controller");
const autenticar = require("../shared/middlewares/auth.middleware");
const { exigirOwner } = require("../shared/middlewares/papel.middleware");

const router = Router();

router.use(autenticar, exigirOwner);

router.get("/", membroController.list);
router.post("/", membroController.create);
router.put("/:id", membroController.update);

module.exports = router;
