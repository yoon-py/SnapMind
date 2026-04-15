const { generateLLM } = require("./llm");
const { detectSourceLanguage } = require("./learningPack");

const {
  buildIdeaChatPrompt,
  collectIdeaContextText,
  hasIdeaContext,
  normalizeIdeaChatMessages,
  normalizeIdeaContext,
} = require("../../shared/backend-core/dist/cjs/ideaChat");
const { trimText } = require("../../shared/backend-core/dist/cjs/text");

function createIdeaChatHandler() {
  return async function handleIdeaChat(request, response) {
    const ideaContext = normalizeIdeaContext(request.body?.ideaContext);
    const messages = normalizeIdeaChatMessages(request.body?.messages);
    const latestMessage = messages.at(-1);

    if (!hasIdeaContext(ideaContext)) {
      response.status(400).json({
        error: "A valid idea context is required.",
      });
      return;
    }

    if (!latestMessage || latestMessage.role !== "user" || !latestMessage.content) {
      response.status(400).json({
        error: "A non-empty learner message is required.",
      });
      return;
    }

    try {
      const languageProfile = detectSourceLanguage(collectIdeaContextText(ideaContext));
      const generation = await generateLLM({
        input: buildIdeaChatPrompt({ ideaContext, messages, languageProfile }),
      });
      const reply = trimText(generation.output_text, "");

      if (!reply) {
        throw new Error("LLM did not return a tutor reply.");
      }

      response.json({ reply });
    } catch (error) {
      response.status(500).json({
        error: "Failed to answer the question about this idea.",
      });
    }
  };
}

module.exports = {
  createIdeaChatHandler,
};
