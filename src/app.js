import { LANG, t, setLanguage } from './i18n.js';
import {
  init, localize, countries, isCorrect, showChallenge, showCard,
  saveChallengeAnswer, clearChallengeAnswer, countryDistance,
} from './game.js';
import { allCapitalsAreCorrect } from './answers.js';
import {
  nextCard, review, validateProgress, nextReviewTime, alignReviewTime, startNextDay,
  CONTINENTS, learningCountries, learningSummary, validateLearningSettings,
} from './learning.js';
import { shuffled, flagChoices } from './flags.js';

const STORAGE_KEY = 'world-map-learning-v1';
const LANGUAGE_KEY = 'world-map-language-v1';
const SETTINGS_KEY = 'world-map-learning-settings-v1';
const menu = document.getElementById('main-menu');
const languageSelect = document.getElementById('language');
const panel = document.getElementById('study-card');
const status = document.getElementById('status');
const info = document.getElementById('country-info');
const answerForm = document.getElementById('card-answer');
const guess = document.getElementById('card-guess');
const options = document.getElementById('flag-options');
const feedback = document.getElementById('card-feedback');
const next = document.getElementById('next-card');
const easy = document.getElementById('too-easy');
const dontKnow = document.getElementById('dont-know');
const resetDeck = document.getElementById('reset-deck');
const settingsButton = document.getElementById('learning-settings-button');
const settingsDialog = document.getElementById('learning-settings');
const continentOptions = document.getElementById('continent-options');
const clearAnswer = document.getElementById('clear-answer');
const clearFlag = document.getElementById('clear-flag');
const headerOptions = document.getElementById('header-options');
const headerActions = document.getElementById('header-actions');
const completion = document.getElementById('learning-complete');
const startTomorrow = document.getElementById('start-next-day');
const modeNames = {
  'challenge-countries': 'challengeCountries', 'challenge-capitals': 'challengeCapitals',
  'challenge-flags': 'challengeFlags', 'learn-countries': 'learnCountries',
  'learn-capitals': 'learnCapitals', 'learn-flags': 'learnFlags',
};

let progress = {};
let learningSettings = {};
let mode = null;
let current = null;
let order = [];
let turn = 0;
let answered = false;
let challengeEvaluated = false;
let reviewTimer = null;
const invalidDecks = new Set();

function notify(key, error) {
  for (const id of ['notice', 'menu-notice', 'settings-notice']) {
    const notice = document.getElementById(id);
    notice.textContent = t(key);
    notice.dataset.reason = key;
    notice.hidden = false;
  }
  if (error) console.error(error);
}

function loadProgress() {
  let parsed;
  let rescheduled = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid saved progress');
  } catch (error) {
    notify('storageError', error);
    for (const key of ['learn-countries', 'learn-capitals', 'learn-flags']) invalidDecks.add(key);
    return;
  }
  for (const [key, deck] of Object.entries(parsed)) {
    try {
      validateProgress({ [key]: deck });
      progress[key] = deck;
      // Retry spacing counts answers in this session; failed cards remain due after a reload.
      for (const card of Object.values(deck)) {
        if (card.retry) card.availableAfter = 0;
        else if (!card.excluded && card.due > Date.now()) {
          const due = alignReviewTime(card.due);
          rescheduled ||= due !== card.due;
          card.due = due;
        }
      }
    } catch (error) {
      invalidDecks.add(key);
      notify('corruptProgress', error);
    }
  }
  if (rescheduled && !invalidDecks.size) saveProgress();
}

function saveProgress() {
  if (invalidDecks.size) {
    notify('corruptProgress');
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    for (const id of ['notice', 'menu-notice', 'settings-notice']) {
      const notice = document.getElementById(id);
      if (['storageError', 'corruptProgress'].includes(notice.dataset.reason)) notice.hidden = true;
    }
  } catch (error) {
    notify('storageError', error);
  }
}

function isLearning() { return mode?.startsWith('learn-'); }
function subject() { return mode.split('-')[1]; }
function deck() { return progress[mode] ||= {}; }
function selectedContinents() { return learningSettings[mode] || CONTINENTS; }
function selectedCountries() { return learningCountries(countries, selectedContinents()); }

function loadLearningSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) learningSettings = validateLearningSettings(JSON.parse(raw));
  } catch (error) {
    notify('learningSettingsError', error);
  }
}

function saveLearningSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(learningSettings));
    for (const id of ['notice', 'menu-notice', 'settings-notice']) {
      const notice = document.getElementById(id);
      if (notice.dataset.reason === 'learningSettingsError') notice.hidden = true;
    }
  } catch (error) {
    notify('learningSettingsError', error);
  }
}

function updateSettingsProgress() {
  const summary = learningSummary(selectedCountries(), deck());
  const number = new Intl.NumberFormat(navigator.languages);
  document.getElementById('settings-progress-scope').textContent = t('selectedProgress', { mode: t(modeNames[mode]) });
  for (const key of ['fresh', 'due', 'scheduled', 'excluded']) {
    document.getElementById(`settings-${key}`).textContent = number.format(summary[key]);
  }
  const reviewed = summary.total - summary.fresh;
  document.getElementById('settings-reviewed').textContent = t('reviewedProgress', {
    reviewed: number.format(reviewed), total: number.format(summary.total),
  });
  const bar = document.getElementById('settings-progress-bar');
  bar.max = summary.total || 1;
  bar.value = reviewed;
}

function openLearningSettings() {
  if (!isLearning()) return;
  clearTimeout(reviewTimer);
  closeHeaderOptions();
  document.getElementById('settings-mode').textContent = t(modeNames[mode]);
  continentOptions.replaceChildren();
  for (const continent of CONTINENTS) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = continent;
    input.checked = selectedContinents().includes(continent);
    const name = document.createElement('span');
    name.textContent = t(continent);
    const count = document.createElement('small');
    count.textContent = t('continentCardCount', {
      count: new Intl.NumberFormat(navigator.languages).format(learningCountries(countries, [continent]).length),
    });
    label.append(input, name, count);
    continentOptions.append(label);
  }
  updateSettingsProgress();
  settingsDialog.showModal();
}

function flag(country, alt) {
  const image = document.createElement('img');
  image.src = `flags/${country.code}.svg`;
  image.alt = alt;
  image.className = 'flag';
  image.addEventListener('error', () => notify('flagError'));
  return image;
}

function line(key, name) {
  const p = document.createElement('p');
  p.textContent = t(key, { name });
  info.append(p);
}

function showInfo(reveal = false) {
  info.replaceChildren();
  if (subject() !== 'countries' || (reveal && !isLearning())) line('countryLabel', current.display);
  if ((!isLearning() && subject() !== 'capitals') || (subject() === 'capitals' && reveal)) {
    line('capitalLabel', current.capitalDisplay.join(' / '));
  }
  if (!(isLearning() && subject() === 'countries') && (subject() !== 'flags' || reveal)) {
    info.append(flag(current, t('learnFlags')));
  }
}

function updateProgress() {
  const el = document.getElementById('card-progress');
  el.textContent = t('learnProgress', learningSummary(selectedCountries(), deck()));
}

function showFlagOptions(saved = '', evaluated = false) {
  options.replaceChildren();
  const chosen = countries.find(c => c.key === saved);
  for (const [i, country] of flagChoices(current, chosen).entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = country.key;
    button.setAttribute('aria-pressed', String(country.key === saved));
    button.disabled = evaluated;
    button.append(flag(country, t('flagOption', { n: i + 1 })));
    if (country.key === saved) button.classList.add('selected-answer');
    if (evaluated && country === current) button.classList.add('right-answer');
    else if (evaluated && country.key === saved) button.classList.add('wrong-answer');
    button.addEventListener('click', () => {
      if (isLearning()) rate(country === current ? 'correct' : 'wrong', button);
      else saveChallengeAnswer(country.key);
    });
    options.append(button);
  }
}

function showChallengeEditor(country, saved, evaluated) {
  completion.hidden = true;
  panel.classList.remove('learning-completed');
  current = country;
  challengeEvaluated = evaluated;
  panel.hidden = !country;
  if (!country) return;
  panel.scrollTop = 0;
  feedback.replaceChildren();
  feedback.className = '';
  next.hidden = true;
  easy.hidden = true;
  dontKnow.hidden = true;
  clearFlag.hidden = evaluated || subject() !== 'flags' || !saved;
  answerForm.hidden = subject() === 'flags';
  options.hidden = subject() !== 'flags';
  showInfo(evaluated);
  const prompt = document.getElementById('card-prompt');
  prompt.hidden = subject() === 'capitals';
  prompt.textContent = subject() === 'flags' ? t('flagPrompt') : '';
  for (const el of answerForm.elements) el.disabled = evaluated;
  answerForm.querySelector('[type="submit"]').hidden = evaluated;
  guess.placeholder = t(current.capitals.length > 1 ? 'allCapitalsPlaceholder' : 'capitalPlaceholder');
  guess.setAttribute('aria-label', guess.placeholder);
  guess.value = saved;
  updateClearControl();
  if (evaluated) {
    const valid = subject() === 'flags' ? saved === current.key : allCapitalsAreCorrect(current, saved, countries);
    feedback.textContent = !saved ? t('notNamed') : valid ? t('answerCorrect') : wrongAnswer();
    feedback.className = !saved ? '' : valid ? 'correct' : 'wrong';
  }
  if (subject() === 'flags') {
    showFlagOptions(saved, evaluated);
    if (!evaluated) options.firstElementChild.focus({ preventScroll: true });
  } else if (!evaluated) {
    guess.focus({ preventScroll: true });
    guess.select();
  }
}

function updateClearControl() {
  clearAnswer.hidden = isLearning() || challengeEvaluated || !guess.value || subject() === 'flags';
}

function wrongAnswer(revealOnly = false) {
  if (revealOnly) {
    if (subject() === 'flags') return t('flagRevealed', { country: current.display });
    return t('answerRevealed', {
      answer: subject() === 'countries' ? current.display : current.capitalDisplay.join(', '),
    });
  }
  if (subject() === 'flags') return t('wrongFlag', { country: current.display });
  if (subject() === 'countries') return t('wrongCountry', { answer: current.display });
  return t(current.capitals.length > 1 ? 'wrongCapitals' : 'wrongCapital', {
    answer: current.capitalDisplay.join(', '),
  });
}

function showCompletion(now) {
  const selected = selectedCountries();
  const active = selected.map(c => deck()[c.key]).filter(c => c && !c.excluded);
  completion.hidden = false;
  panel.classList.add('learning-completed');
  document.getElementById('completion-title').textContent = t(selected.length ? 'learningDone' : 'noContinentsTitle');
  document.getElementById('completion-summary').textContent =
    t(!selected.length ? 'noContinentsHelp' : active.length ? 'learningDoneHelp' : 'allEasy');
  document.getElementById('completion-schedule').hidden = !active.length;
  document.getElementById('completion-early').hidden = !active.length;
  if (!active.length) return;
  const restart = nextReviewTime(now);
  const due = Math.min(...active.map(c => c.due));
  const count = active.filter(c => c.due <= restart).length;
  const date = document.getElementById('completion-date');
  date.dateTime = new Date(due).toISOString();
  document.getElementById('completion-day').textContent =
    new Intl.DateTimeFormat(navigator.languages, { dateStyle: 'full' }).format(due);
  document.getElementById('completion-time').textContent =
    new Intl.DateTimeFormat(navigator.languages, { timeStyle: 'short' }).format(due);
  document.getElementById('completion-count').textContent = t('scheduledReviews', {
    count: new Intl.NumberFormat(navigator.languages).format(active.filter(c => c.due === due).length),
  });
  document.getElementById('completion-restart').textContent = t('dailyRestart', {
    time: new Intl.DateTimeFormat(navigator.languages, { timeStyle: 'short' }).format(restart),
  });
  document.getElementById('completion-early-help').textContent = count ? t('earlyStartHelp', {
    count: new Intl.NumberFormat(navigator.languages).format(count),
  }) : t('noReviewsTomorrow');
  startTomorrow.disabled = !count || invalidDecks.size > 0;
  reviewTimer = setTimeout(advance, Math.max(restart - now, 1000));
}

function advance() {
  clearTimeout(reviewTimer);
  const now = Date.now();
  const lastKey = current?.key;
  const key = nextCard(order, deck(), turn, now, lastKey, countryDistance);
  current = countries.find(c => c.key === key) || null;
  answered = false;
  panel.scrollTop = 0;
  feedback.replaceChildren();
  feedback.className = '';
  completion.hidden = true;
  panel.classList.remove('learning-completed');
  next.hidden = true;
  easy.hidden = true;
  easy.disabled = true;
  dontKnow.hidden = !current;
  dontKnow.disabled = false;
  clearAnswer.hidden = true;
  clearFlag.hidden = true;
  answerForm.hidden = !current || subject() === 'flags';
  answerForm.querySelector('[type="submit"]').hidden = false;
  options.hidden = !current || subject() !== 'flags';
  options.replaceChildren();
  updateProgress();
  showCard(current, isLearning(), subject() === 'capitals');
  if (!current) {
    info.replaceChildren();
    document.getElementById('card-prompt').hidden = true;
    document.getElementById('card-prompt').textContent = '';
    if (isLearning()) showCompletion(now);
    return;
  }
  showInfo();
  document.getElementById('card-prompt').hidden = subject() !== 'flags';
  document.getElementById('card-prompt').textContent = t({
    countries: 'countryPrompt', capitals: 'capitalPrompt', flags: 'flagPrompt',
  }[subject()]);
  guess.placeholder = t(subject() === 'countries' ? 'countryPrompt' :
    current.capitals.length > 1 ? 'allCapitalsPlaceholder' : 'capitalPlaceholder');
  guess.setAttribute('aria-label', guess.placeholder);
  guess.value = '';
  for (const el of answerForm.elements) el.disabled = false;
  if (subject() === 'flags') {
    showFlagOptions();
    options.firstElementChild.focus({ preventScroll: true });
  } else {
    guess.focus({ preventScroll: true });
  }
}

function rate(rating, chosen = null, revealOnly = false) {
  if (!current || answered) return;
  answered = true;
  turn++;
  if (isLearning()) {
    deck()[current.key] = review(deck()[current.key], rating, turn);
    saveProgress();
  }
  for (const el of answerForm.elements) el.disabled = true;
  answerForm.querySelector('[type="submit"]').hidden = true;
  for (const button of options.children) {
    button.disabled = true;
    if (button.dataset.key === current.key) button.classList.add('right-answer');
    else if (button === chosen) button.classList.add('wrong-answer');
  }
  feedback.textContent = rating === 'wrong' ? wrongAnswer(revealOnly) : t('answerCorrect');
  feedback.className = revealOnly ? '' : rating === 'wrong' ? 'wrong' : 'correct';
  showInfo(true);
  updateProgress();
  easy.hidden = !isLearning() || rating !== 'correct';
  easy.disabled = easy.hidden;
  dontKnow.hidden = true;
  next.hidden = false;
  next.focus({ preventScroll: true });
}

function start(selectedMode) {
  clearTimeout(reviewTimer);
  mode = selectedMode;
  current = null;
  turn = 0;
  challengeEvaluated = false;
  menu.close();
  document.getElementById('mode-title').textContent = t(modeNames[mode]);
  const learningCountries = mode === 'learn-countries';
  answerForm.querySelector('[type="submit"]').textContent = t(
    learningCountries ? 'checkAnswerShort' : isLearning() ? 'checkAnswer' : 'save',
  );
  if (learningCountries) answerForm.append(dontKnow);
  else panel.querySelector('.card-actions').prepend(dontKnow);
  answerForm.querySelector('[type="submit"]').hidden = false;
  panel.querySelector('.card-heading').hidden = true;
  panel.querySelector('.card-actions').hidden = !isLearning();
  document.getElementById('card-progress').hidden = !isLearning();
  clearAnswer.hidden = true;
  clearFlag.hidden = true;
  settingsButton.hidden = !isLearning();
  panel.hidden = !isLearning();
  if (!isLearning()) {
    showChallenge(subject(), subject() === 'countries' ? null : showChallengeEditor);
    return;
  }
  status.textContent = t(modeNames[mode]);
  if (isLearning()) {
    for (const card of Object.values(deck())) if (card.retry) card.availableAfter = 0;
  }
  order = shuffled(selectedCountries().map(c => c.key));
  advance();
}

function openMenu() {
  closeHeaderOptions();
  clearTimeout(reviewTimer);
  document.getElementById('namer').hidden = true;
  document.getElementById('tooltip').hidden = true;
  if (!menu.open) menu.showModal();
  const first = menu.querySelector('[data-mode]');
  (first.disabled ? menu : first).focus({ preventScroll: true });
}

function closeHeaderOptions() {
  headerOptions.setAttribute('aria-expanded', 'false');
  headerOptions.closest('header').classList.remove('header-actions-open');
}

headerOptions.addEventListener('click', () => {
  const open = headerOptions.getAttribute('aria-expanded') !== 'true';
  headerOptions.setAttribute('aria-expanded', String(open));
  headerOptions.closest('header').classList.toggle('header-actions-open', open);
});
headerActions.addEventListener('click', closeHeaderOptions);
document.addEventListener('pointerdown', event => {
  if (!headerOptions.closest('header').contains(event.target)) closeHeaderOptions();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && headerOptions.getAttribute('aria-expanded') === 'true') {
    closeHeaderOptions();
    headerOptions.focus({ preventScroll: true });
    event.preventDefault();
  }
});

answerForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!guess.value.trim()) return;
  if (!isLearning()) {
    saveChallengeAnswer(guess.value);
    return;
  }
  const valid = subject() === 'countries' ? isCorrect(current, guess.value) :
    allCapitalsAreCorrect(current, guess.value, countries);
  rate(valid ? 'correct' : 'wrong');
});
next.addEventListener('click', advance);
startTomorrow.addEventListener('click', () => {
  if (!isLearning() || current || startTomorrow.disabled) return;
  startNextDay(deck(), Date.now(), order);
  saveProgress();
  advance();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isLearning() && !current && !menu.open && !settingsDialog.open) advance();
});
dontKnow.addEventListener('click', () => rate('wrong', null, true));
clearAnswer.addEventListener('click', clearChallengeAnswer);
clearFlag.addEventListener('click', clearChallengeAnswer);
guess.addEventListener('input', updateClearControl);
easy.addEventListener('click', () => {
  if (!current || !answered || easy.hidden) return;
  deck()[current.key] = review(deck()[current.key], 'easy', turn);
  saveProgress();
  advance();
});
settingsButton.addEventListener('click', openLearningSettings);
continentOptions.addEventListener('change', () => {
  learningSettings[mode] = [...continentOptions.querySelectorAll('input:checked')].map(input => input.value);
  saveLearningSettings();
  order = shuffled(selectedCountries().map(c => c.key));
  updateSettingsProgress();
  updateProgress();
});
settingsDialog.addEventListener('close', () => {
  if (isLearning() && !menu.open && (!current || !order.includes(current.key))) advance();
});
resetDeck.addEventListener('click', () => {
  if (!confirm(t('resetConfirm'))) return;
  progress[mode] = {};
  invalidDecks.delete(mode);
  saveProgress();
  current = null;
  settingsDialog.close();
});
document.getElementById('menu-button').addEventListener('click', openMenu);
document.getElementById('retry-load').addEventListener('click', () => location.reload());
menu.addEventListener('cancel', event => event.preventDefault());
for (const button of menu.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => start(button.dataset.mode));
}

languageSelect.addEventListener('change', () => {
  try {
    localStorage.setItem(LANGUAGE_KEY, languageSelect.value);
  } catch (error) {
    languageSelect.value = LANG;
    notify('storageError', error);
    return;
  }
  location.reload();
});

try {
  const language = localStorage.getItem(LANGUAGE_KEY);
  if (language !== null) setLanguage(language);
} catch (error) {
  notify('storageError', error);
}
languageSelect.value = LANG;
localize();
loadProgress();
loadLearningSettings();
openMenu();
init().then(() => {
  for (const button of menu.querySelectorAll('[data-mode]')) button.disabled = false;
  if (menu.open && document.activeElement === menu) {
    menu.querySelector('[data-mode]').focus({ preventScroll: true });
  }
  document.getElementById('menu-status').textContent = '';
  document.getElementById('evaluate').hidden = true;
}).catch(error => {
  console.error(error);
  status.textContent = t('loadError');
  document.getElementById('menu-status').textContent = t('loadError');
  document.getElementById('retry-load').hidden = false;
});
