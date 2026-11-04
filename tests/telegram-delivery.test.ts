import { describe, expect, it } from "bun:test";
import { isTelegramBotBlocked } from "../src/lib/telegram-delivery";

describe("Telegram recipient block evidence", () => {
  it("recognizes an explicit Telegram recipient block", () => {
    expect(isTelegramBotBlocked(new Error("Telegram sendMessage failed [403]: Forbidden: bot was blocked by the user"))).toBe(true);
  });
  it("recognizes the same explicit block for media", () => {
    expect(isTelegramBotBlocked(new Error("Telegram sendPhoto failed [403]: Forbidden: bot was blocked by the user"))).toBe(true);
  });
  it("does not mistake a missing chat for a block", () => {
    expect(isTelegramBotBlocked(new Error("Telegram sendMessage failed [400]: Bad Request: chat not found"))).toBe(false);
  });
  it("does not mistake a deactivated account for a block", () => {
    expect(isTelegramBotBlocked(new Error("Telegram sendMessage failed [403]: Forbidden: user is deactivated"))).toBe(false);
  });
  it("does not mistake another forbidden response for a block", () => {
    expect(isTelegramBotBlocked(new Error("Telegram sendMessage failed [403]: Forbidden: bot can't initiate conversation with a user"))).toBe(false);
  });
  it("does not mistake configuration access denial for a block", () => {
    expect(isTelegramBotBlocked(new Error("Gateway failed [403]: access denied"))).toBe(false);
  });
});