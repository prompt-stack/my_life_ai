import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { evalCaseSchema } from '../evals/types.js';
import { isAlarmRequest } from './alarm-intent.js';

const alarmEvalCases = z
  .array(evalCaseSchema)
  .parse(JSON.parse(readFileSync(new URL('../evals/cases/alarms.json', import.meta.url), 'utf8')));

describe('isAlarmRequest', () => {
  it.each([
    'Set an alarm for 6 AM',
    'Wake me up at 5:45 am with marimba',
    'Set an alarm for 7:15 PM, use the piano one',
    'Set an alarm at 7',
    'Wake me at 8:30 a.m. on weekends',
    'What alarms do I have?',
    'What sounds are there?',
    'What alarm sounds are there?',
    'Play the chimes sound',
    'Let me hear the xylophone',
    'Change my 6:30 AM alarm to 7 AM',
    'Use guitar for my 6:30',
    'Turn off my wake up alarm',
    'Delete my 9:30 PM alarm',
    'Set one for 6',
    'Move it to 18:00',
    'Get me up in 20 minutes',
    'in half an hour please',
    'at noon',
    'Snooze',
    'Gisingin mo ako ng alas sais',
    'Mag-alarma ka',
    'Every weekday please',
  ])('matches %j', (text) => {
    expect(isAlarmRequest(text, [])).toBe(true);
  });

  it.each([
    'Tell me a fun fact about octopuses',
    'How do I cook adobo?',
    'What time is it?',
    'Good morning!',
    'Send a text to Mom',
    'Remind me to buy milk',
    'Summarize my unread emails',
    'What is the capital of France?',
  ])('does not match %j', (text) => {
    expect(isAlarmRequest(text, [])).toBe(false);
  });

  it('matches a short answer to an alarm question through the recent turns', () => {
    const history = [
      { role: 'user' as const, text: 'Delete my 6 AM alarm' },
      { role: 'assistant' as const, text: 'Your closest alarm is 6:30 AM. Delete that one?' },
    ];
    expect(isAlarmRequest('Yes', history)).toBe(true);
    expect(isAlarmRequest('The calm one', [{ role: 'assistant', text: 'Which sound: Sunrise, Chimes, Marimba, Piano or Guitar?' }])).toBe(true);
  });

  it('ignores alarm talk older than the last two exchanges', () => {
    const history = [
      { role: 'user' as const, text: 'Set an alarm for 6 AM' },
      { role: 'assistant' as const, text: 'Done.' },
      { role: 'user' as const, text: 'Tell me a joke' },
      { role: 'assistant' as const, text: 'Why did the chicken cross the road?' },
      { role: 'user' as const, text: 'Why?' },
      { role: 'assistant' as const, text: 'To get to the other side.' },
    ];
    expect(isAlarmRequest('Another one', history)).toBe(false);
  });

  it.each(['Stop', 'Enough', 'Turn it off', 'Five more minutes', 'Shut up', 'Okay okay'])(
    'matches %j while an alarm rings',
    (text) => {
      expect(isAlarmRequest(text, [], { alarmRinging: true })).toBe(true);
    },
  );

  it.each(['Stop the music', 'Stop', 'Turn it off', 'Five more minutes'])('does not match %j when nothing rings', (text) => {
    expect(isAlarmRequest(text, [])).toBe(false);
    expect(isAlarmRequest(text, [], { alarmRinging: false })).toBe(false);
  });

  it.each(['Stop the alarm', 'Dismiss my alarm', 'Snooze it', 'Snooze for 5 minutes'])('matches %j even when nothing rings', (text) => {
    expect(isAlarmRequest(text, [])).toBe(true);
  });

  // Every alarm eval must still get the alarm tools and rules, or the model could not act.
  it.each(alarmEvalCases.map((evalCase) => [evalCase.id, evalCase] as const))('matches alarm eval %s', (_id, evalCase) => {
    const alarmRinging = Boolean(evalCase.device?.ringingAlarmId);
    expect(isAlarmRequest(evalCase.prompt, evalCase.history ?? [], { alarmRinging })).toBe(true);
  });
});
