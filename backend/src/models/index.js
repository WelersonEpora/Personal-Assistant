"use strict";

const sequelize = require("../config/database");

const db = {};

db.Usuario = require("./usuario")(sequelize);
db.Aluno = require("./aluno")(sequelize);
db.Registro = require("./registro")(sequelize);
db.RegistroEntrada = require("./registroEntrada")(sequelize);
db.ArquivoAudio = require("./arquivoAudio")(sequelize);
db.Transcricao = require("./transcricao")(sequelize);
db.ResultadoIa = require("./resultadoIa")(sequelize);
db.Validacao = require("./validacao")(sequelize);

Object.values(db).forEach((model) => {
  if (model.associate) {
    model.associate(db);
  }
});

db.sequelize = sequelize;

module.exports = db;
