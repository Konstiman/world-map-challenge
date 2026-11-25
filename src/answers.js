export function normalize(s) {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/[.'’`,()\-–]/g, ' ')
    .replace(/\b(st|sankt)\b/g, 'saint')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

export function levenshtein(a, b, transpositions = false) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrev = null;
  for (let i = 1; i <= a.length; i++) {
    const old = transpositions ? [...prev] : null;
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (beforePrev && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        prev[j] = Math.min(prev[j], beforePrev[j - 2] + 1);
      }
      diag = tmp;
    }
    beforePrev = old;
  }
  return prev[b.length];
}

export function tolerance(len) {
  return len >= 10 ? 2 : len >= 5 ? 1 : 0;
}

export function capitalIsCorrect(country, guess, countries) {
  const g = normalize(guess);
  if (!g) return false;
  const distance = c => Math.min(...c.capitalNames.map(n => levenshtein(g, normalize(n), true)));
  const target = distance(country);
  return target <= tolerance(g.length) && countries.every(c => distance(c) >= target);
}

export function allCapitalsAreCorrect(country, guess, countries) {
  if (country.capitals.length === 1) return capitalIsCorrect(country, guess, countries);
  const tokens = normalize(guess.replace(/[;/]/g, ' '))
    .replace(/\b(and|und|a)\b/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const groups = country.capitalGroups.map(names => [...new Set(names.map(name => normalize(name).replace(/\s/g, '')))]);
  const complete = (1 << groups.length) - 1;
  const memo = new Map();
  const match = (start, used) => {
    if (start === tokens.length) return used === complete;
    if (used === complete) return false;
    const key = `${start}:${used}`;
    if (memo.has(key)) return memo.get(key);
    for (let end = start + 1; end <= tokens.length; end++) {
      const text = tokens.slice(start, end).join('');
      for (let i = 0; i < groups.length; i++) {
        if (used & (1 << i)) continue;
        const accepted = groups[i].some(name =>
          Math.abs(name.length - text.length) <= tolerance(text.length) &&
          levenshtein(text, name, true) <= tolerance(text.length));
        if (accepted && match(end, used | (1 << i))) {
          memo.set(key, true);
          return true;
        }
      }
    }
    memo.set(key, false);
    return false;
  };
  return match(0, 0);
}
