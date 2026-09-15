const SERIES = {
  Arknights: 'Arknights',
  AzurLane: 'Azur Lane',
  BlueArchive: 'Blue Archive',
  Fate: 'Fate Grand Order',
  MAWS: 'My Adventures with Superman',
  Honkai: 'Honkai: Star Rail',
  ReZero: 'Re:Zero',
  Shakugan: 'Shakugan no Shana',
  Shadowverse: 'Shadowverse: Worlds Beyond',
  Touhou: 'Touhou Project',
  ZZZ: 'Zenless Zone Zero',
  OldSchool: 'Old School'
};

const OLDSCHOOL_SETS = [
  { codes: ['AN', 'ARN'], blackBorder: true },
  { codes: ['AQ', 'ATQ'], blackBorder: true },
  { codes: ['LE', 'LEG'], blackBorder: true },
  { codes: ['LEB'], blackBorder: true },
  { codes: ['DK', 'DRK'], blackBorder: true },
  { codes: ['FE', 'FEM'], blackBorder: true },
  { codes: ['4E', '4ED'], blackBorder: false },
  { codes: ['IA', 'ICE'], blackBorder: true },
  { codes: ['CH', 'CHR'], blackBorder: false },
  { codes: ['REN'], blackBorder: false },
  { codes: ['HM', 'HML'], blackBorder: true },
  { codes: ['AL', 'ALL'], blackBorder: true },
  { codes: ['MI', 'MIR'], blackBorder: true },
  { codes: ['VI', 'VIS'], blackBorder: true },
  { codes: ['5E', '5ED'], blackBorder: false },
  { codes: ['PO', 'POR'], blackBorder: true },
  { codes: ['WL', 'WTH'], blackBorder: true },
  { codes: ['TE', 'TMP'], blackBorder: true },
  { codes: ['ST', 'STH'], blackBorder: true },
  { codes: ['EX', 'EXO'], blackBorder: true },
  { codes: ['P2', 'P02'], blackBorder: true },
  { codes: ['UG', 'UGL'], blackBorder: true },
  { codes: ['UZ', 'USG'], blackBorder: true },
  { codes: ['ATH'], blackBorder: false },
  { codes: ['UL', 'ULG'], blackBorder: true },
  { codes: ['6E', '6ED'], blackBorder: false },
  { codes: ['PK', 'PTK'], blackBorder: true },
  { codes: ['UD', 'UDS'], blackBorder: true },
  { codes: ['P3', 'S99'], blackBorder: false },
  { codes: ['MM', 'MMQ'], blackBorder: true },
  { codes: ['BRC'], blackBorder: true },
  { codes: ['BR', 'BRB'], blackBorder: false },
  { codes: ['BRR'], blackBorder: true },
  { codes: ['NE', 'NEM'], blackBorder: true },
  { codes: ['S00'], blackBorder: false },
  { codes: ['PR', 'PCY'], blackBorder: true },
  { codes: ['IN', 'INV'], blackBorder: true },
  { codes: ['BTD'], blackBorder: false },
  { codes: ['PS', 'PLS'], blackBorder: true },
  { codes: ['JUD'], blackBorder: true },
  { codes: ['7E', '7ED'], blackBorder: false },
  { codes: ['AP', 'APC'], blackBorder: true },
  { codes: ['OD', 'ODY'], blackBorder: true },
  { codes: ['TSR'], blackBorder: true },
  { codes: ['P23'], blackBorder: true }
];

const OLDSCHOOL_FALLBACKS = [
  { code: 'AFR', blackBorder: true },
  { code: '5DN', blackBorder: true },
  { code: 'M12', blackBorder: true }
];

const BASIC_LAND_NAMES = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes']);

const state = { file: null, text: '', proxyXml: null, oldSchoolCards: null };
const dropZone = document.querySelector('#dropZone');
const fileInput = document.querySelector('#fileInput');
const uploadButton = document.querySelector('#uploadButton');
const convertButton = document.querySelector('#convertButton');
const seriesSelect = document.querySelector('#seriesSelect');
const status = document.querySelector('#status');
const statusText = document.querySelector('#statusText');
const fileTitle = document.querySelector('#fileTitle');
const fileHint = document.querySelector('#fileHint');
const summary = document.querySelector('#summary');
const details = document.querySelector('#details');

function setStatus(message, type = '') {
  status.className = `status ${type}`;
  statusText.textContent = message;
}

async function loadReference(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return new DOMParser().parseFromString(await response.text(), 'application/xml');
}

function parseXml(text) {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('The selected file is not valid XML.');
  return document;
}

function attribute(element, name) {
  return element.getAttribute(name) || '';
}

function cardName(element) {
  return element.getAttribute('name') || element.querySelector('name')?.textContent?.trim() || '';
}

function allCards(document) {
  return [...document.querySelectorAll('card')];
}

function findProxy(name, flavor) {
  const candidates = allCards(state.proxyXml).filter(card => cardName(card).toLowerCase() === name.toLowerCase());
  return candidates.flatMap(card => [...card.querySelectorAll('set')].map(set => ({ card, set }))).find(item => attribute(item.set, 'flavorName') === flavor) || null;
}

async function loadOldSchoolCards(names) {
  if (state.oldSchoolCards) return state.oldSchoolCards;
  const allSets = [
    ...OLDSCHOOL_SETS,
    ...OLDSCHOOL_FALLBACKS.map(code => ({ codes: [code.code], blackBorder: code.blackBorder, fallback: true })),
    { codes: ['PRM'], blackBorder: true }
  ];
  const setData = new Map();
  await Promise.all(allSets.map(async set => {
    const code = set.codes[set.codes.length - 1];
    const response = await fetch(`https://mtgjson.com/api/v5/${code}.json`);
    if (!response.ok) {
      if (set.optional) return;
      throw new Error(`Could not load Old School set ${code}.`);
    }
    setData.set(code, (await response.json()).data);
  }));

  const cards = new Map();
  const findCard = (code, name, predicate = () => true) =>
    (setData.get(code)?.cards || []).find(card => card.name.toLowerCase() === name && predicate(card));
  const choose = (name, candidates) => candidates.map(code => findCard(code, name)).find(Boolean);

  for (const name of names) {
    if (name === 'prismatic vista') {
      const card = findCard('PRM', name, item =>
        item.number === '91399' && item.identifiers?.scryfallId === 'bac5d6f2-e7f9-4d94-b4e7-b480c7e04460'
      );
      if (card) {
        cards.set(name, { card });
        continue;
      }
    }

    if (BASIC_LAND_NAMES.has(name)) {
      const card = choose(name, name === 'wastes' ? ['TSR'] : ['POR', 'TMP', 'MIR']);
      if (card) {
        cards.set(name, { card });
        continue;
      }
    }

    const mainCandidates = OLDSCHOOL_SETS.flatMap(set => set.codes.map(code => ({
      code,
      blackBorder: set.blackBorder,
      card: findCard(code, name)
    }))).filter(item => item.card && (!item.blackBorder || item.card.borderColor === 'black'));
    const main = mainCandidates.find(item => item.blackBorder) || mainCandidates[0];
    const fallback = OLDSCHOOL_FALLBACKS
      .map(set => findCard(set.code, name, card => !set.blackBorder || card.borderColor === 'black'))
      .find(Boolean);
    const selected = main?.card || fallback;
    if (selected) cards.set(name, { card: selected });
  }

  state.oldSchoolCards = cards;
  return cards;
}

function isClm(card) {
  return attribute(card, 'setShortName').toUpperCase() === 'CLM';
}

function applyProxy(deckCard, proxySet) {
  deckCard.setAttribute('setShortName', 'CLM');
  deckCard.setAttribute('uuid', attribute(proxySet, 'uuid'));
  deckCard.removeAttribute('collectorNumber');
}

function applyFallback(deckCard, printing) {
  deckCard.setAttribute('setShortName', printing.textContent.trim());
  deckCard.setAttribute('uuid', attribute(printing, 'uuid'));
  const collector = attribute(printing, 'num');
  if (collector) deckCard.setAttribute('collectorNumber', collector);
  else deckCard.removeAttribute('collectorNumber');
}

function applyOldSchool(deckCard, printing) {
  deckCard.setAttribute('setShortName', printing.card.setCode);
  deckCard.setAttribute('collectorNumber', printing.card.number);
  const uuid = printing.card.identifiers?.scryfallId;
  if (uuid) deckCard.setAttribute('uuid', uuid);
  else deckCard.removeAttribute('uuid');
}

function cardQuantity(deckCard) {
  const quantity = Number.parseInt(deckCard.getAttribute('number') || '1', 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function download(text, name) {
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function convert() {
  try {
    const deck = parseXml(state.text);
    const flavor = seriesSelect.value;
    const deckCards = [...deck.querySelectorAll('card[name]')];
    let proxies = 0;
    let fallbacks = 0;
    let untouched = 0;
    const notes = [];
    const names = new Set(deckCards.map(card => cardName(card).toLowerCase()));
    const oldSchoolCards = flavor === 'OldSchool' ? await loadOldSchoolCards(names) : null;

    for (const deckCard of deckCards) {
      const name = cardName(deckCard);
      const quantity = cardQuantity(deckCard);
      if (flavor === 'OldSchool') {
        const printing = oldSchoolCards.get(name.toLowerCase());
        if (printing) {
          applyOldSchool(deckCard, printing);
          proxies += quantity;
          continue;
        }
      }
      const proxy = findProxy(name, flavor);
      if (proxy) {
        applyProxy(deckCard, proxy.set);
        proxies += quantity;
        continue;
      }
      untouched += quantity;
    }

    const output = new XMLSerializer().serializeToString(deck);
    download(output, state.file.name);
    document.querySelector('#proxyCount').textContent = proxies;
    document.querySelector('#proxyLabel').textContent = flavor === 'OldSchool' ? 'old school printings' : 'proxies updated';
    document.querySelector('#fallbackCount').textContent = fallbacks;
    document.querySelector('#untouchedCount').textContent = untouched;
    document.querySelector('#summaryTitle').textContent = `✅ Your ${SERIES[flavor]} deck is ready!`;
    details.innerHTML = notes.map(note => `<li>${note}</li>`).join('');
    summary.hidden = false;
    setStatus(`Downloaded ${state.file.name}`, 'is-ready');
  } catch (error) {
    setStatus(error.message, 'is-error');
  }
}

async function acceptFile(file) {
  if (!file || !/\.cod$/i.test(file.name)) {
    setStatus('Choose a .cod file to continue.', 'is-error');
    return;
  }
  try {
    state.file = file;
    state.text = await file.text();
    state.oldSchoolCards = null;
    parseXml(state.text);
    if (!state.proxyXml) state.proxyXml = await loadReference('../lechugapod.xml');
    fileTitle.textContent = file.name;
    fileHint.textContent = 'Ready to Convert!';
    convertButton.disabled = false;
    setStatus('Deck loaded. Choose a series, then convert.', 'is-ready');
  } catch (error) {
    setStatus(error.message, 'is-error');
  }
}

uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', event => acceptFile(event.target.files[0]));
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('is-dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'));
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('is-dragging'); acceptFile(event.dataTransfer.files[0]); });
dropZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') fileInput.click(); });
convertButton.addEventListener('click', convert);
