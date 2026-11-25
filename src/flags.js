export function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function prepareFlagNeighbors(countries, distance) {
  for (const country of countries) {
    country.flagNeighbors = countries.filter(c => c !== country)
      .map(c => ({ country: c, distance: distance(country.key, c.key) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10)
      .map(entry => entry.country);
  }
}

export function flagChoices(country, saved = null) {
  // Keep saved answers visible, including choices made before nearby flags were introduced.
  const included = saved && saved !== country ? [country, saved] : [country];
  const distractors = shuffled(country.flagNeighbors.filter(c => !included.includes(c)))
    .slice(0, 4 - included.length);
  return shuffled([...included, ...distractors]);
}
