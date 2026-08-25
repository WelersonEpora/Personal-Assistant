"use strict";

const express = require("express");
const routes = require("./routes");
const requestLogger = require("./shared/middlewares/request-logger");
const notFoundHandler = require("./shared/middlewares/not-found-handler");
const errorHandler = require("./shared/middlewares/error-handler");

const app = express();

app.disable("x-powered-by");

app.use(requestLogger);
app.use(express.json());
app.use("/", routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
