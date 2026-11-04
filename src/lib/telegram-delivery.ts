/** Only Telegram's explicit recipient-blocked response establishes a bot block. */
export function isTelegramBotBlocked(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /^Telegram \w+ failed \[403\]:\s*(?:Forbidden:\s*)?bot was blocked by the user\s*$/i.test(message);
}