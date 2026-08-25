"use strict";

const pino = require("pino");
const env = require("../../config/env");

const isProduction = env.nodeEnv === "production";

const logger = pino({
  level: isProduction ? "info" : "debug",
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
    censor: "[REDACTED]"
  },
  transport:
    isProduction || env.nodeEnv === "test"
      ? undefined
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname"
          }
        }
});

module.exports = logger;
