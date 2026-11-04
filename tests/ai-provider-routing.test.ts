import { describe, expect, test } from "bun:test";
import {
  aiChatAvailable,
  directChatModelId,
  directEmbeddingModelId,
  hasDirectAiKeys,
} from "../src/lib/ai-gateway.server";

const SAVED: Record<string, string | undefined> = {};
function withEnv(keys: string[], fn: () => void) {
  for (const k of keys) {
    SAVED[k] = process.env[k];
    delete process.env[k];
  }
  try {
    fn();
  } finally {
    for (const k of keys) {
      if (SAVED[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED[k];
    }
  }
}

describe("AI provider routing (gateway vs own keys)", () => {
  test("gateway chat ids map to provider-direct ids by stripping the prefix", () => {
    withEnv(["AI_CHAT_MODEL", "AI_EMBEDDING_MODEL"], () => {
      expect(directChatModelId("google/gemini-3.6-flash")).toBe("gemini-3.6-flash");
      expect(directChatModelId("google/gemini-2.5-flash")).toBe("gemini-2.5-flash");
      expect(directEmbeddingModelId("openai/text-embedding-3-small")).toBe(
        "text-embedding-3-small",
      );
    });
  });

  test("env overrides win over the stripped id when own keys are used", () => {
    withEnv(["AI_CHAT_MODEL", "AI_EMBEDDING_MODEL"], () => {
      process.env.AI_CHAT_MODEL = "gemini-2.5-flash";
      process.env.AI_EMBEDDING_MODEL = "text-embedding-3-small";
      expect(directChatModelId("google/gemini-3.6-flash")).toBe("gemini-2.5-flash");
      expect(directEmbeddingModelId("openai/text-embedding-3-small")).toBe(
        "text-embedding-3-small",
      );
      delete process.env.AI_CHAT_MODEL;
      delete process.env.AI_EMBEDDING_MODEL;
    });
  });

  test("own provider keys enable the direct route", () => {
    withEnv(["GEMINI_API_KEY", "OPENAI_API_KEY"], () => {
      expect(hasDirectAiKeys()).toBe(false);
      process.env.GEMINI_API_KEY = "test-gemini-key";
      expect(hasDirectAiKeys()).toBe(true);
      delete process.env.GEMINI_API_KEY;
      process.env.OPENAI_API_KEY = "test-openai-key";
      expect(hasDirectAiKeys()).toBe(true);
    });
  });

  test("chat availability needs a direct Gemini key or the gateway key", () => {
    withEnv(["GEMINI_API_KEY", "LOVABLE_API_KEY"], () => {
      expect(aiChatAvailable()).toBe(false);
      process.env.GEMINI_API_KEY = "test-gemini-key";
      expect(aiChatAvailable()).toBe(true);
      delete process.env.GEMINI_API_KEY;
      process.env.LOVABLE_API_KEY = "test-gateway-key";
      expect(aiChatAvailable()).toBe(true);
    });
  });
});
