const MAP_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
const STORAGE_KEY = 'name-the-countries';

// Features that are shown but not part of the quiz.
const EXCLUDED = new Set([
  'Antarctica', 'Siachen Glacier', 'Ashmore and Cartier Is.', 'Indian Ocean Ter.',
  'Heard I. and McDonald Is.', 'Fr. S. Antarctic Lands', 'Br. Indian Ocean Ter.',
  'S. Geo. and the Is.',
]);

// Map name -> [display name, ...accepted alternatives]
const ALIASES = {
  'United States of America': ['United States', 'USA', 'US', 'America'],
  'United Kingdom': ['United Kingdom', 'UK', 'Great Britain', 'Britain'],
  'United Arab Emirates': ['United Arab Emirates', 'UAE', 'Emirates'],
  'N. Mariana Is.': ['Northern Mariana Islands'],
  'U.S. Virgin Is.': ['U.S. Virgin Islands', 'US Virgin Islands', 'United States Virgin Islands'],
  'Falkland Is.': ['Falkland Islands', 'Falklands', 'Malvinas'],
  'Faeroe Is.': ['Faroe Islands', 'Faroes', 'Faeroe Islands'],
  'Wallis and Futuna Is.': ['Wallis and Futuna'],
  'Pitcairn Is.': ['Pitcairn Islands', 'Pitcairn'],
  'Turkey': ['Turkey', 'Türkiye'],
  'Timor-Leste': ['Timor-Leste', 'East Timor'],
  'eSwatini': ['Eswatini', 'Swaziland'],
  'S. Sudan': ['South Sudan'],
  'South Korea': ['South Korea', 'Korea', 'Republic of Korea'],
  'North Korea': ['North Korea', 'DPRK'],
  'São Tomé and Principe': ['São Tomé and Príncipe', 'Sao Tome'],
  'St. Vin. and Gren.': ['Saint Vincent and the Grenadines', 'Saint Vincent'],
  'St. Kitts and Nevis': ['Saint Kitts and Nevis', 'Saint Kitts'],
  'Russia': ['Russia', 'Russian Federation'],
  'Netherlands': ['Netherlands', 'Holland'],
  'Czechia': ['Czechia', 'Czech Republic'],
  'Macedonia': ['North Macedonia', 'Macedonia'],
  'Laos': ['Laos', 'Lao PDR'],
  "Côte d'Ivoire": ["Côte d'Ivoire", 'Ivory Coast'],
  'Dem. Rep. Congo': ['DR Congo', 'Democratic Republic of the Congo', 'Democratic Republic of Congo', 'DRC', 'Congo-Kinshasa', 'Zaire'],
  'Congo': ['Republic of the Congo', 'Congo', 'Republic of Congo', 'Congo-Brazzaville', 'Congo Republic'],
  'Central African Rep.': ['Central African Republic', 'CAR'],
  'Cabo Verde': ['Cabo Verde', 'Cape Verde'],
  'Myanmar': ['Myanmar', 'Burma'],
  'Bosnia and Herz.': ['Bosnia and Herzegovina', 'Bosnia'],
  'Antigua and Barb.': ['Antigua and Barbuda', 'Antigua'],
  'Dominican Rep.': ['Dominican Republic'],
  'Eq. Guinea': ['Equatorial Guinea'],
  'W. Sahara': ['Western Sahara'],
  'Fr. Polynesia': ['French Polynesia'],
  'St. Pierre and Miquelon': ['Saint Pierre and Miquelon'],
  'St-Martin': ['Saint Martin'],
  'St-Barthélemy': ['Saint Barthélemy', 'Saint Barts'],
  'N. Cyprus': ['Northern Cyprus'],
  'Vatican': ['Vatican City', 'Vatican', 'Holy See'],
  'Micronesia': ['Micronesia', 'Federated States of Micronesia'],
  'Palestine': ['Palestine', 'State of Palestine'],
  'Brunei': ['Brunei', 'Brunei Darussalam'],
  'Iran': ['Iran', 'Persia'],
  'Syria': ['Syria', 'Syrian Arab Republic'],
  'Vietnam': ['Vietnam', 'Viet Nam'],
  'Macao': ['Macao', 'Macau'],
  'Åland': ['Åland', 'Åland Islands'],
  'China': ['China', "People's Republic of China", 'PRC'],
  'Ireland': ['Ireland', 'Republic of Ireland', 'Eire'],
  'Kyrgyzstan': ['Kyrgyzstan', 'Kyrgyz Republic'],
  'Saint Helena': ['Saint Helena', 'St Helena'],
};

const svg = d3.select('#map');
const viewport = svg.append('g');
const countryLayer = viewport.append('g');
const labelLayer = viewport.append('g');
const statusEl = document.getElementById('status');
const evaluateBtn = document.getElementById('evaluate');
const resetBtn = document.getElementById('reset');
const form = document.getElementById('namer');
const input = document.getElementById('guess');
const tooltip = document.getElementById('tooltip');

let countries = [];          // quiz countries: { key, display, names[], feature, anchor }
let byKey = new Map();
let guesses = new Map();     // key -> typed text
let results = null;          // key -> 'correct' | 'wrong' (after evaluation)
let selected = null;
let zoomK = 1;
let zoom = null;
let homeTransform = d3.zoomIdentity;
const header = document.querySelector('header');
const footer = document.querySelector('footer');
const introDialog = document.getElementById('intro');
const resultDialog = document.getElementById('result');
const INTRO_KEY = 'name-the-countries-intro-seen';

function normalize(s) {
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

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function tolerance(len) {
  return len >= 10 ? 2 : len >= 5 ? 1 : 0;
}

// A guess is correct if its closest match among all countries is this one (within typo tolerance).
function isCorrect(country, guess) {
  const g = normalize(guess);
  if (!g) return false;
  let best = null, bestDist = Infinity, ambiguous = false;
  for (const c of countries) {
    for (const n of c.names) {
      const d = levenshtein(g, n);
      if (d < bestDist) { best = c; bestDist = d; ambiguous = false; }
      else if (d === bestDist && c !== best) ambiguous = true;
    }
  }
  return !ambiguous && best === country && bestDist <= tolerance(g.length);
}

// English names (and aliases) are always accepted; German/Czech names are added for those languages.
function namesFor(mapName) {
  const list = ALIASES[mapName] || [mapName.replace(/ Is\.$/, ' Islands')];
  const local = localNames(mapName);
  const display = local[0] || list[0];
  const raw = [mapName, ...list, ...local];
  for (const n of local) {
    if (/[äöü]/i.test(n)) raw.push(n.replace(/[äöüÄÖÜ]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' }[c])));
  }
  const all = new Set(raw.map(normalize));
  for (const n of [...all]) {
    if (n.endsWith(' islands')) all.add(n.slice(0, -' islands'.length));
  }
  return { display, names: [...all] };
}

// Label anchor: centroid of the largest polygon (avoids e.g. France's label landing in the Atlantic).
function anchorFor(feature, path) {
  const g = feature.geometry;
  if (g.type !== 'MultiPolygon') return path.centroid(feature);
  let best = null, bestArea = -1;
  for (const coords of g.coordinates) {
    const poly = { type: 'Polygon', coordinates: coords };
    const a = d3.geoArea(poly);
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  return path.centroid(best);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...guesses]));
}

function load() {
  try {
    guesses = new Map(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    for (const k of guesses.keys()) if (!byKey.has(k)) guesses.delete(k);
  } catch {
    guesses = new Map();
  }
}

function render() {
  countryLayer.selectAll('path.quiz')
    .attr('class', d => {
      const cls = ['country', 'quiz'];
      if (results) cls.push(results.get(d.key) || 'missed');
      else if (d.key === selected) cls.push('selected');
      else if (guesses.has(d.key)) cls.push('named');
      return cls.join(' ');
    });

  const labeled = countries.filter(c => guesses.has(c.key));
  labelLayer.selectAll('text')
    .data(labeled, d => d.key)
    .join('text')
    .attr('class', 'label')
    .attr('x', d => d.anchor[0])
    .attr('y', d => d.anchor[1])
    .text(d => guesses.get(d.key));
  updateLabelSize();

  if (results) {
    const correct = [...results.values()].filter(v => v === 'correct').length;
    statusEl.textContent = t('score', { correct, total: countries.length });
  } else {
    statusEl.textContent = t('named', { n: guesses.size, total: countries.length });
  }
  evaluateBtn.disabled = !!results || guesses.size === 0;
  evaluateBtn.hidden = !!results;
  resetBtn.hidden = !results;
}

function updateLabelSize() {
  labelLayer.selectAll('text')
    .attr('font-size', 11 / zoomK)
    .attr('stroke-width', 3 / zoomK);
}

function select(key) {
  selected = key;
  if (key) {
    form.hidden = false;
    input.value = guesses.get(key) || '';
    input.focus();
    input.select();
    requestAnimationFrame(keepSelectedVisible);
  } else {
    form.hidden = true;
  }
  render();
}

function commit(text) {
  if (!selected) return;
  const t = text.trim();
  if (t) guesses.set(selected, t); else guesses.delete(selected);
  save();
  select(t ? nearestUnnamed(selected) : null);
}

function nearestUnnamed(key) {
  const [x, y] = byKey.get(key).anchor;
  let best = null, bestD = Infinity;
  for (const c of countries) {
    if (guesses.has(c.key)) continue;
    const d = (c.anchor[0] - x) ** 2 + (c.anchor[1] - y) ** 2;
    if (d < bestD) { bestD = d; best = c.key; }
  }
  return best;
}

function evaluate() {
  select(null);
  results = new Map();
  for (const [key, guess] of guesses) {
    results.set(key, isCorrect(byKey.get(key), guess) ? 'correct' : 'wrong');
  }
  render();
  showResult();
}

function showResult() {
  const total = countries.length;
  const correct = [...results.values()].filter(v => v === 'correct').length;
  const wrong = results.size - correct;
  const thresholds = [1, 10, 40, 100, 180];
  const verdicts = t('verdicts');
  document.getElementById('verdict').textContent = verdicts[thresholds.filter(n => correct >= n).length];
  document.getElementById('score-correct').textContent = correct;
  document.getElementById('score-outof').textContent = t('outOf', { total });
  document.getElementById('stat-correct').textContent = correct;
  document.getElementById('stat-wrong').textContent = wrong;
  document.getElementById('stat-missed').textContent = total - results.size;
  document.getElementById('accuracy').textContent = t('accuracy', { pct: Math.round(100 * correct / results.size) });
  const bar = document.getElementById('score-bar');
  bar.style.width = '0';
  resultDialog.showModal();
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = (100 * correct / total) + '%'; }));
}

function reset() {
  results = null;
  guesses = new Map();
  save();
  input.value = '';
  tooltip.hidden = true;
  select(null);
}

function showTooltip(event, d) {
  if (!results) { tooltip.hidden = true; return; }
  const guess = guesses.get(d.key);
  const status = results.get(d.key);
  let html = `<b>${d.display}</b>`;
  if (status === 'wrong') html += ` — ${escapeHtml(t('youWrote', { guess }))}`;
  else if (!guess) html += ` — ${t('notNamed')}`;
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const r = tooltip.getBoundingClientRect();
  const x = Math.min(event.clientX + 12, window.innerWidth - r.width - 8);
  const y = event.clientY + 12 + r.height > window.innerHeight - 8 ? event.clientY - r.height - 12 : event.clientY + 12;
  tooltip.style.left = Math.max(8, x) + 'px';
  tooltip.style.top = y + 'px';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Natural Earth draws Crimea as part of Russia; move it to Ukraine and dissolve the shared border.
function assignCrimeaToUkraine(world, features) {
  const geoms = world.objects.countries.geometries;
  const ru = geoms.find(g => g.properties.name === 'Russia');
  const ua = geoms.find(g => g.properties.name === 'Ukraine');
  if (!ru || !ua || ru.type !== 'MultiPolygon') return;

  const isCrimea = arcs => {
    const [lon, lat] = d3.geoCentroid(topojson.feature(world, { type: 'Polygon', arcs }));
    return lon > 32 && lon < 37 && lat > 44 && lat < 46.5;
  };
  const crimea = ru.arcs.filter(isCrimea);
  if (!crimea.length) return;

  const rest = ru.arcs.filter(a => !isCrimea(a));
  const ruFeature = features.find(f => f.properties.name === 'Russia');
  const uaFeature = features.find(f => f.properties.name === 'Ukraine');
  ruFeature.geometry = topojson.feature(world, { type: 'MultiPolygon', arcs: rest }).geometry;
  uaFeature.geometry = topojson.merge(world, [ua, ...crimea.map(arcs => ({ type: 'Polygon', arcs }))]);
}

// Fits the map to the screen. In portrait, the initial view is zoomed so the map fills the available height.
function layout() {
  const W = svg.node().clientWidth, H = svg.node().clientHeight;
  const top = header.offsetHeight;
  const bottom = footer.offsetHeight + 4;
  document.documentElement.style.setProperty('--header-h', top + 'px');
  svg.attr('viewBox', [0, 0, W, H]);

  const projection = d3.geoNaturalEarth1().fitExtent([[8, top + 8], [W - 8, H - bottom]], { type: 'Sphere' });
  const path = d3.geoPath(projection);
  const [[x0, y0], [x1, y1]] = path.bounds({ type: 'Sphere' });

  countryLayer.selectAll('path').attr('d', path);
  for (const c of countries) c.anchor = anchorFor(c.feature, path);

  const availH = H - top - bottom;
  const k = H > W ? Math.max(1, (availH - 16) / (y1 - y0)) : 1;
  homeTransform = d3.zoomIdentity
    .translate(W / 2, top + availH / 2)
    .scale(k)
    .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);

  zoom
    .extent([[0, 0], [W, H]])
    .scaleExtent([1, 300])
    .translateExtent([[x0 - 40, y0 - top - 8], [x1 + 40, y1 + bottom + 8]]);
  svg.call(zoom.transform, homeTransform);
  render();
}

// Pans the map so the selected country isn't hidden behind the header, name field or on-screen keyboard.
function keepSelectedVisible() {
  if (!selected) return;
  const t = d3.zoomTransform(svg.node());
  const [x, y] = t.apply(byKey.get(selected).anchor);
  const vv = window.visualViewport;
  const margin = 30;
  const f = form.getBoundingClientRect();
  const formOnTop = f.top < window.innerHeight / 2;
  const minY = (formOnTop ? f.bottom : header.getBoundingClientRect().bottom) + margin;
  const maxY = Math.min(formOnTop ? Infinity : f.top, vv ? vv.offsetTop + vv.height : window.innerHeight) - margin;
  const minX = margin, maxX = window.innerWidth - margin;
  const dx = x < minX ? minX - x : x > maxX ? maxX - x : 0;
  const dy = maxY < minY ? 0 : y < minY ? minY - y : y > maxY ? maxY - y : 0;
  if (dx || dy) svg.transition().duration(250).call(zoom.translateBy, dx / t.k, dy / t.k);
}

async function init() {
  const world = await d3.json(MAP_URL);
  const features = topojson.feature(world, world.objects.countries).features;
  assignCrimeaToUkraine(world, features);

  for (const f of features) {
    const name = f.properties.name;
    if (EXCLUDED.has(name)) continue;
    const { display, names } = namesFor(name);
    f.key = name;
    f.display = display;
    countries.push({ key: name, display, names, feature: f, anchor: [0, 0] });
  }
  byKey = new Map(countries.map(c => [c.key, c]));

  countryLayer.selectAll('path')
    .data(features)
    .join('path')
    .attr('class', d => EXCLUDED.has(d.properties.name) ? 'country inert' : 'country quiz')
    .filter(d => !EXCLUDED.has(d.properties.name))
    .on('click', (event, d) => {
      event.stopPropagation();
      if (results) showTooltip(event, d);
      else select(d.key);
    })
    .on('pointermove', (event, d) => { if (event.pointerType === 'mouse') showTooltip(event, d); })
    .on('pointerleave', event => { if (event.pointerType === 'mouse') tooltip.hidden = true; });

  zoom = d3.zoom()
    .clickDistance(6)
    .on('zoom', ({ transform }) => {
      viewport.attr('transform', transform);
      if (transform.k !== zoomK) { zoomK = transform.k; updateLabelSize(); }
    });
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click', () => { tooltip.hidden = true; select(null); });

  load();
  layout();

  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    // Ignore height-only changes (e.g. the mobile keyboard or browser toolbar showing/hiding).
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    layout();
  });
  window.visualViewport?.addEventListener('resize', keepSelectedVisible);
}

form.addEventListener('submit', e => { e.preventDefault(); commit(input.value); });
document.getElementById('clear').addEventListener('click', () => commit(''));
input.addEventListener('keydown', e => { if (e.key === 'Escape') select(null); });
evaluateBtn.addEventListener('click', evaluate);
resetBtn.addEventListener('click', reset);
document.getElementById('help').addEventListener('click', () => { select(null); introDialog.showModal(); });
introDialog.addEventListener('close', () => localStorage.setItem(INTRO_KEY, '1'));
resultDialog.addEventListener('close', () => { if (resultDialog.returnValue === 'again') reset(); });
for (const d of [introDialog, resultDialog]) {
  // Close when clicking the backdrop.
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
}

function localize() {
  document.documentElement.lang = LANG;
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', el.title);
  }
  document.getElementById('intro-steps').innerHTML = t('introSteps').map(s => `<li><span>${s}</span></li>`).join('');
}

localize();
if (!localStorage.getItem(INTRO_KEY)) introDialog.showModal();

init().catch(err => {
  statusEl.textContent = t('loadError');
  console.error(err);
});
