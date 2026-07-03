const multer = require("multer");

const sharedConstants = require("../../shared/backend-core/dist/cjs/constants");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8788);
const model = process.env.OPENAI_MODEL || "gpt-5.4";
const LLM_PROVIDER = process.env.LLM_PROVIDER || "openai";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

// Local / OpenAI-compatible endpoint (Ollama, LM Studio, llama.cpp, ...)
// Used when LLM_PROVIDER === "local". Ollama's OpenAI-compatible API lives at
// http://localhost:11434/v1 and ignores the API key.
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://localhost:11434/v1";
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "hermes3";

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
  LLM_BASE_URL,
  LLM_PROVIDER,
  LOCAL_LLM_MODEL,
  model,
  port,
  upload,
};
