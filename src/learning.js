export const DAY = 24 * 60 * 60 * 1000;
const INTERVALS = [1, 3, 7, 14, 30];

export function review(previous, rating, turn, now = Date.now()) {
  if (rating === 'easy') return { stage: 0, due: 0, retry: false, availableAfter: 0, excluded: true };
  if (rating === 'wrong') {
    return { stage: 0, due: now, retry: true, availableAfter: turn + 4, excluded: false };
  }
  if (rating !== 'correct') throw new Error('Invalid review rating');
  const stage = Math.min((previous?.stage || 0) + 1, INTERVALS.length);
  return { stage, due: now + INTERVALS[stage - 1] * DAY, retry: false, availableAfter: 0, excluded: false };
}

export function nextCard(keys, progress, turn, now = Date.now(), lastKey = null) {
  const due = keys.filter(key => !progress[key]?.excluded && (progress[key]?.due || 0) <= now);
  const ready = due.filter(key => !progress[key]?.retry || progress[key].availableAfter <= turn);
  // If only failed cards remain, repeat immediately rather than leaving the deck stuck.
  const pool = ready.length ? ready : due;
  const alternatives = pool.filter(key => key !== lastKey);
  const candidates = alternatives.length ? alternatives : pool;
  return candidates.sort((a, b) => {
    const pa = progress[a], pb = progress[b];
    const retryOrder = Number(!!pb?.retry) - Number(!!pa?.retry);
    return retryOrder || Number(!!pb) - Number(!!pa) || (pa?.due || 0) - (pb?.due || 0);
  })[0] || null;
}

export function validateProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid learning progress');
  for (const deck of Object.values(value)) {
    if (!deck || typeof deck !== 'object' || Array.isArray(deck)) throw new Error('Invalid learning deck');
    for (const card of Object.values(deck)) {
      if (!card || !Number.isInteger(card.stage) || card.stage < 0 || card.stage > INTERVALS.length ||
        !Number.isFinite(card.due) || card.due < 0 || typeof card.excluded !== 'boolean' ||
        typeof card.retry !== 'boolean' || !Number.isInteger(card.availableAfter) || card.availableAfter < 0) {
        throw new Error('Invalid learning card');
      }
    }
  }
  return value;
}
