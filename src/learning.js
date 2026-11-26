export const DAY = 24 * 60 * 60 * 1000;
const INTERVALS = [1, 3, 7, 14, 30];
const CONTINENT_CODES = {
  africa: 'dz ao bj bw bf bi cv cm cf td km cd cg ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu ma mz na ne ng rw st sn sc sl so za ss sd tz tg tn ug zm zw',
  asia: 'af am az bh bd bt bn kh cn cy ge in id ir iq il jp jo kz kw kg la lb my mv mn mm np kp om pk ph qa sa sg kr lk sy tw tj th tl tr tm ae uz vn ye',
  europe: 'ad al at by be ba bg hr cz dk ee fi fr de gr hu is ie it lv li lt lu mt md mc me nl mk no pl pt ro ru sm rs sk si es se ch ua gb va xk',
  northAmerica: 'ag bs bb bz ca cr cu dm do sv gd gt ht hn jm mx ni pa kn lc vc tt us gl',
  southAmerica: 'ar bo br cl co ec gy py pe sr uy ve',
  oceania: 'au fj ki mh fm nr nz pw pg ws sb to tv vu',
};
export const CONTINENTS = Object.keys(CONTINENT_CODES);
const continentByCode = new Map(Object.entries(CONTINENT_CODES).flatMap(([continent, codes]) =>
  codes.split(' ').map(code => [code, continent])));

export function learningCountries(countries, selected = CONTINENTS) {
  return countries.filter(country => {
    const continent = continentByCode.get(country.code);
    if (!continent) throw new Error(`Missing continent for country: ${country.code}`);
    return selected.includes(continent);
  });
}

export function validateLearningSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid learning settings');
  for (const [mode, selected] of Object.entries(value)) {
    if (!['learn-countries', 'learn-capitals', 'learn-flags'].includes(mode) ||
      !Array.isArray(selected) || new Set(selected).size !== selected.length ||
      selected.some(continent => !CONTINENTS.includes(continent))) {
      throw new Error('Invalid learning continents');
    }
  }
  return value;
}

export function learningSummary(countries, progress, now = Date.now()) {
  const summary = { total: countries.length, fresh: 0, due: 0, scheduled: 0, excluded: 0 };
  for (const country of countries) {
    const card = progress[country.key];
    if (!card) summary.fresh++;
    else if (card.excluded) summary.excluded++;
    else if (card.due <= now || card.availableEarly) summary.due++;
    else summary.scheduled++;
  }
  return summary;
}

export function nextReviewTime(now = Date.now(), days = 1) {
  const date = new Date(now);
  if (date.getHours() < 4) date.setDate(date.getDate() - 1);
  date.setDate(date.getDate() + days);
  date.setHours(4, 0, 0, 0);
  return date.getTime();
}

export function alignReviewTime(due) {
  const date = new Date(due);
  return date.getHours() === 4 && date.getMinutes() === 0 &&
    date.getSeconds() === 0 && date.getMilliseconds() === 0 ? due : nextReviewTime(due);
}

export function startNextDay(progress, now = Date.now(), keys = Object.keys(progress)) {
  const cutoff = nextReviewTime(now);
  for (const key of keys) {
    const card = progress[key];
    if (card && !card.excluded && card.due > now && card.due <= cutoff) card.availableEarly = true;
  }
}

export function review(previous, rating, turn, now = Date.now()) {
  if (rating === 'easy') return { stage: 0, due: 0, retry: false, availableAfter: 0, excluded: true };
  if (rating === 'wrong') {
    return { stage: 0, due: now, retry: true, availableAfter: turn + 4, excluded: false };
  }
  if (rating !== 'correct') throw new Error('Invalid review rating');
  const stage = Math.min((previous?.stage || 0) + 1, INTERVALS.length);
  const reviewedAt = previous?.availableEarly ? Math.max(now, previous.due) : now;
  return { stage, due: nextReviewTime(reviewedAt, INTERVALS[stage - 1]), retry: false, availableAfter: 0, excluded: false };
}

export function nextCard(keys, progress, turn, now = Date.now(), lastKey = null, distance = null) {
  const due = keys.filter(key => !progress[key]?.excluded &&
    ((progress[key]?.due || 0) <= now || progress[key]?.availableEarly));
  const ready = due.filter(key => !progress[key]?.retry || progress[key].availableAfter <= turn);
  // If only failed cards remain, repeat immediately rather than leaving the deck stuck.
  const pool = ready.length ? ready : due;
  const alternatives = pool.filter(key => key !== lastKey);
  const candidates = alternatives.length ? alternatives : pool;
  return candidates.sort((a, b) => {
    const pa = progress[a], pb = progress[b];
    const retryOrder = Number(!!pb?.retry) - Number(!!pa?.retry);
    return retryOrder || Number(!!pb) - Number(!!pa) ||
      (lastKey && distance ? distance(lastKey, a) - distance(lastKey, b) : 0) ||
      (pa?.due || 0) - (pb?.due || 0);
  })[0] || null;
}

export function validateProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid learning progress');
  for (const deck of Object.values(value)) {
    if (!deck || typeof deck !== 'object' || Array.isArray(deck)) throw new Error('Invalid learning deck');
    for (const card of Object.values(deck)) {
      if (!card || !Number.isInteger(card.stage) || card.stage < 0 || card.stage > INTERVALS.length ||
        !Number.isFinite(card.due) || card.due < 0 || typeof card.excluded !== 'boolean' ||
        typeof card.retry !== 'boolean' || !Number.isInteger(card.availableAfter) || card.availableAfter < 0 ||
        (card.availableEarly !== undefined && typeof card.availableEarly !== 'boolean')) {
        throw new Error('Invalid learning card');
      }
    }
  }
  return value;
}
