const multer = require("multer");

const sharedConstants = require("../../shared/backend-core/dist/cjs/constants");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8788);
const model = process.env.OPENAI_MODEL || "gpt-5.4";
const LLM_PROVIDER = String(process.env.LLM_PROVIDER || "openai").toLowerCase();
const MEDIA_PROVIDER = String(process.env.MEDIA_PROVIDER || LLM_PROVIDER).toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "cedar";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024,
  },
});

module.exports = {
  ...sharedConstants,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  host,
  LLM_PROVIDER,
  MEDIA_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_IMAGE_MODEL,
  OPENAI_TTS_MODEL,
  OPENAI_TTS_VOICE,
  model,
  port,
  upload,
};
