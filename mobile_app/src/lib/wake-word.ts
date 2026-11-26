export type TriggerResult = {
  triggered: boolean;
  /** Text spoken after the trigger, without leading punctuation or filler. Empty for a bare trigger. */
  command: string;
};

const NO_MATCH: TriggerResult = { triggered: false, command: '' };

/** Characters that may not touch a trigger word (so said, rain, wait, again, Thailand, j'ai never match). */
const LEFT = "(^|[^A-Za-z0-9'’])";
const RIGHT = "(?![A-Za-z0-9'’])";

/**
 * STRONG forms: unmistakably "AI", accepted anywhere in the utterance.
 *   "AI", "A.I.", "a.i", "a i", "a. i.", "a-i", "ay eye", "a eye", "aye eye", "ei eye", "eh eye", "ay-eye".
 * "Hey AI", "OK AI" and "MyLife AI" need no special case: the lone "AI" inside them is found.
 */
const STRONG = new RegExp(
  LEFT + '(?:a\\.i\\.?|ai|a(?:\\s*[.\\-]\\s*|\\s)i\\.?|(?:a|ay|aye|ei|eh)[ -]eye)' + RIGHT,
  'i',
);

/** Filler a speaker (or the recognizer) puts before the trigger: "um, hey ...". */
const PREFIX = "[\\s,.!?\\-]*(?:(?:um+|uh+|hey|hi|ok|okay|oh|yo)(?![A-Za-z0-9'’])[\\s,.!?\\-]*)*";

/**
 * LEADING form: "ei" is not an English word, so as the very first word it counts as "AI" and may be
 * followed by a command ("ei set an alarm").
 */
const LEADING = new RegExp('^' + PREFIX + '(ei)' + RIGHT, 'i');

/**
 * WHOLE-UTTERANCE forms: renderings that are common words or interjections ("ay" in Taglish, "eh I
 * think...") are accepted only when they are the entire utterance: "ay", "aye", "ay i", "eh i",
 * optionally after "hey/okay". This keeps ordinary sentences from triggering.
 */
const WHOLE = new RegExp('^' + PREFIX + '(?:ay[ -]i|eh[ -]i|ay|aye)[\\s.,!?]*$', 'i');

const LEADING_NOISE =
  /^(?:[\s,.:;!?"“”\-–—]+|(?:um+|uh+|er|ah|hmm+|okay|ok|please)(?![A-Za-z0-9']))+/i;

function commandAfter(transcript: string, endIndex: number): string {
  return transcript.slice(endIndex).replace(LEADING_NOISE, '').trim();
}

/**
 * Looks for the spoken word "AI" in one transcript. Pure and side-effect free. Run it on interim
 * results too: the caller decides when a partial match is settled.
 *
 * Rule: strong forms match anywhere; "ei" matches as the first word; interjection-like forms
 * ("ay", "aye", "ay i", "eh i") match only as the whole utterance. Bare "I", "eye" and "hey" never match.
 *
 *   "AI"                              -> triggered, ""
 *   "Hey AI" / "OK AI" / "MyLife AI"  -> triggered, ""
 *   "AI, set an alarm for 6 AM"       -> triggered, "set an alarm for 6 AM"
 *   "Hey A.I., what's the weather?"   -> triggered, "what's the weather?"
 *   "a i um, call mom"                -> triggered, "call mom"
 *   "ay eye text Mom"                 -> triggered, "text Mom"
 *   "ei set a timer"                  -> triggered, "set a timer"
 *   "ay" / "Hey, ay i."               -> triggered, ""
 *   "ay naku" / "eh I think so"       -> not triggered
 *   "said it again" / "rain in Thailand" / "j'ai faim" / "AIR conditioning" -> not triggered
 */
export function detectTrigger(transcript: string): TriggerResult {
  const strong = STRONG.exec(transcript);
  if (strong)
    return {
      triggered: true,
      command: commandAfter(transcript, strong.index + strong[0].length),
    };
  const leading = LEADING.exec(transcript);
  if (leading)
    return {
      triggered: true,
      command: commandAfter(transcript, leading[0].length),
    };
  if (WHOLE.test(transcript)) return { triggered: true, command: '' };
  return NO_MATCH;
}

/** Same as [detectTrigger] over several recognizer alternatives (best first); the first that triggers wins. */
export function detectTriggerInAlternatives(transcripts: readonly string[]): TriggerResult {
  for (const transcript of transcripts) {
    const result = detectTrigger(transcript);
    if (result.triggered) return result;
  }
  return NO_MATCH;
}
