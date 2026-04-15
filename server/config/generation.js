const multer = require("multer");

const sharedConstants = require("../../shared/backend-core/dist/cjs/constants");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8788);
const model = process.env.OPENAI_MODEL || "gpt-5.4";
const LLM_PROVIDER = process.env.LLM_PROVIDER || "openai";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

module.exports = {
  ...sharedConstants,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  host,
  LLM_PROVIDER,
  model,
  port,
  upload,
};
