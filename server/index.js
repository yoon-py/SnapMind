const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();

const { GEMINI_MODEL, LLM_PROVIDER, host, model, port, upload } = require("./config/generation");
const { createGenerationHandlers } = require("./lib/learningPack");
const { createIdeaChatHandler } = require("./lib/ideaChat");
const { createAuthRouter } = require("./routes/auth");
const { createAuthSessionStore } = require("./stores/authSessionStore");
const { createJobStore } = require("./stores/jobStore");

function createApp() {
  const app = express();
  const jobStore = createJobStore();
  const authSessionStore = createAuthSessionStore();
  const { handleGeneratePack, handleGetJobStatus, handleSignMediaUrl } = createGenerationHandlers({ jobStore });

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      configured:
        LLM_PROVIDER === "gemini" ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.OPENAI_API_KEY),
      model: LLM_PROVIDER === "gemini" ? GEMINI_MODEL : model,
      llmProvider: LLM_PROVIDER,
    });
  });

  app.post("/api/generate-pack", upload.single("sourceFile"), handleGeneratePack);
  app.get("/api/generate-pack/:jobId/status", handleGetJobStatus);
  app.post("/api/media/sign", handleSignMediaUrl);
  app.post("/api/idea-chat", createIdeaChatHandler());
  app.use("/auth", createAuthRouter({ sessionStore: authSessionStore }));

  return app;
}

const app = createApp();

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`SnapMind backend listening on http://${host}:${port}`);
  });
}

module.exports = {
  app,
  createApp,
};
