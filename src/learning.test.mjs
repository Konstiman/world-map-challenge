import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY, review, nextCard, validateProgress } from './learning.js';
import { capitalIsCorrect, allCapitalsAreCorrect } from './answers.js';
import { capitalNames, capitalAnswerGroups } from './capitals.js';

test('successful reviews follow the defined schedule and cap at 30 days', () => {
  let card;
  for (const days of [1, 3, 7, 14, 30, 30]) {
    card = review(card, 'correct', 0, 100);
    assert.equal(card.due, 100 + days * DAY);
  }
  assert.equal(nextCard(['a'], { a: card }, 0, card.due - 1), null);
  assert.equal(nextCard(['a'], { a: card }, 0, card.due), 'a');
});

test('missed cards return after other cards and reset their successful streak', () => {
  const failed = review(review(null, 'correct', 0, 0), 'wrong', 1, 100);
  const progress = { a: failed };
  assert.equal(failed.stage, 0);
  assert.equal(nextCard(['a', 'b'], progress, 2, 100), 'b');
  assert.equal(nextCard(['a', 'b'], progress, 5, 100), 'a');
  assert.equal(nextCard(['a'], progress, 2, 100, 'a'), 'a');
  assert.equal(review(failed, 'correct', 6, 100).due, 100 + DAY);
});

test('too-easy cards are excluded even when overdue and can be reset independently', () => {
  const progress = { a: review(null, 'easy', 0, 0), b: review(null, 'correct', 0, 0) };
  assert.equal(nextCard(['a', 'b'], progress, 0, 2 * DAY), 'b');
  assert.equal(nextCard(['a'], progress, 0, 100 * DAY), null);
  delete progress.a;
  assert.equal(nextCard(['a'], progress, 0, 0), 'a');
  assert.equal(progress.b.stage, 1);
});

test('due reviews precede new cards and future cards never appear early', () => {
  const progress = { a: review(null, 'correct', 0, 0), b: review(null, 'correct', 0, 0) };
  progress.b.due = 3 * DAY;
  assert.equal(nextCard(['a', 'b', 'c'], progress, 0, 2 * DAY), 'a');
  assert.equal(nextCard(['a', 'b'], progress, 0, 2 * DAY), 'a');
});

test('malformed saved progress is rejected rather than treated as a completed deck', () => {
  assert.throws(() => validateProgress([]));
  assert.throws(() => validateProgress({ capitals: { a: { due: 'tomorrow' } } }));
  assert.throws(() => review(null, 'invalid', 0, 0));
  const progress = { capitals: { a: review(null, 'correct', 0, 0) } };
  assert.deepEqual(validateProgress(JSON.parse(JSON.stringify(progress))), progress);
});

test('capital answers accept aliases, accents, multiple capitals and minor typos, not another capital', () => {
  const prague = { capitalNames: ['Prague', 'Praha', 'Prag'] };
  const paris = { capitalNames: ['Paris'] };
  const africa = { capitalNames: ['Pretoria', 'Cape Town', 'Bloemfontein'] };
  const all = [prague, paris, africa];
  assert.equal(capitalIsCorrect(prague, 'práha', all), true);
  assert.equal(capitalIsCorrect(prague, 'prage', all), true);
  assert.equal(capitalIsCorrect(prague, 'Paris', all), false);
  assert.equal(capitalIsCorrect(prague, '', all), false);
  assert.equal(capitalIsCorrect(africa, 'Cape Town', all), true);
});

test('localized capital names remain valid answers alongside English and multiple capitals', () => {
  const data = JSON.parse(readFileSync(new URL('./countries.json', import.meta.url), 'utf8'));
  for (const language of ['de', 'cs']) {
    const countries = Object.values(data).map(country => ({
      ...country,
      capitalNames: [...country.capitalNames, ...country.capitals.flatMap(name => capitalNames(name, language))],
    }));
    const prague = countries.find(c => c.code === 'cz');
    const africa = countries.find(c => c.code === 'za');
    const sriLanka = countries.find(c => c.code === 'lk');
    assert.equal(capitalIsCorrect(prague, language === 'de' ? 'Prag' : 'Praha', countries), true);
    assert.equal(capitalIsCorrect(prague, 'Prague', countries), true);
    assert.equal(capitalIsCorrect(prague, language === 'de' ? 'Wien' : 'Vídeň', countries), false);
    assert.equal(capitalIsCorrect(africa, language === 'de' ? 'Kapstadt' : 'Kapské Město', countries), true);
    for (const name of sriLanka.capitals) {
      assert.equal(capitalIsCorrect(sriLanka, capitalNames(name, language)[0], countries), true);
    }
  }
});

test('capital challenge accepts all capitals in any order with flexible separators, aliases and typos', () => {
  const data = JSON.parse(readFileSync(new URL('./countries.json', import.meta.url), 'utf8'));
  const countries = Object.values(data).map(c => ({ ...c, capitalGroups: capitalAnswerGroups(c.capitals) }));
  const africa = countries.find(c => c.code === 'za');
  for (const answer of [
    'Pretoria, Bloemfontein, Cape Town', 'Cape Town Pretoria Bloemfontein',
    'Kapstadt; Bloemfontein / Pretoria', 'Kapské Město, Pretoria a Bloemfontein',
    'CapeTown Pretroia Bloemfonten', 'Tshwane Mangaung Kaapstad',
  ]) {
    assert.equal(allCapitalsAreCorrect(africa, answer, countries), true, answer);
  }
  const sriLanka = countries.find(c => c.code === 'lk');
  assert.equal(allCapitalsAreCorrect(sriLanka, 'Kolombo Kotte', countries), true);
  const bolivia = countries.find(c => c.code === 'bo');
  assert.equal(allCapitalsAreCorrect(bolivia, 'La Paz, Sucre', countries), true);
  const eswatini = countries.find(c => c.code === 'sz');
  assert.equal(allCapitalsAreCorrect(eswatini, 'Lobamba Mbabane', countries), true);
});

test('capital challenge rejects missing, repeated and unrelated capitals without changing learning acceptance', () => {
  const data = JSON.parse(readFileSync(new URL('./countries.json', import.meta.url), 'utf8'));
  const countries = Object.values(data).map(c => ({ ...c, capitalGroups: capitalAnswerGroups(c.capitals) }));
  const africa = countries.find(c => c.code === 'za');
  for (const answer of ['', 'Pretoria', 'Pretoria Pretoria Cape Town', 'Pretoria Cape Town Paris', 'Pretoria Bloemfontein Cape Town Paris']) {
    assert.equal(allCapitalsAreCorrect(africa, answer, countries), false, answer);
  }
  assert.equal(capitalIsCorrect(africa, 'Cape Town', countries), true);
  const france = countries.find(c => c.code === 'fr');
  assert.equal(allCapitalsAreCorrect(france, 'Paris', countries), true);
  assert.equal(allCapitalsAreCorrect(france, 'Prague', countries), false);
});
