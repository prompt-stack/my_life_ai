/**
 * The phone strips the trigger word "AI" before sending a `wake_word` turn,
 * but a leftover "AI, ..." or "Hey AI ..." at the start must not confuse the
 * model or the alarm pre-filter, so the server strips it too.
 *
 * Only a leading trigger is removed: "Tell me about AI" keeps its "AI".
 */

/**
 * Optional greeting (hey/ok/okay/hi), optional "MyLife", then "AI" / "A.I." /
 * "A. I." as a standalone word, then any separating punctuation or spaces.
 * The lookahead keeps words that merely start with "ai" ("aim", "aisle").
 */
const LEADING_TRIGGER =
  /^[\s,.!?:;…–—-]*(?:(?:hey|ok|okay|hi)[\s,.!?:;…–—-]*)?(?:my\s*life[\s,]*)?(?:a\.\s?i\.?|ai)(?=[\s,.!?:;…–—-]|$)[\s,.!?:;…–—-]*/i;

/** Text with a leading wake phrase removed and trimmed; empty when the user only said the trigger. */
export function stripWakeWord(text: string): string {
  return text.replace(LEADING_TRIGGER, '').trim();
}
