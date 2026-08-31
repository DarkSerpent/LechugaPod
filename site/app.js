const SERIES = {
  Arknights: 'Arknights',
  BlueArchive: 'Blue Archive',
  Fate: 'Fate Grand Order',
  Honkai: 'Honkai: Star Rail',
  ReZero: 'Re:Zero',
  Shakugan: 'Shakugan no Shana',
  Shadowverse: 'Shadowverse: Worlds Beyond',
  Touhou: 'Touhou Project'
};

const state = { file: null, text: '', proxyXml: null, savedXml: null };
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

function latestPrinting(name) {
  const card = allCards(state.savedXml).find(item => cardName(item).toLowerCase() === name.toLowerCase());
  if (!card) return null;
  const sets = [...card.querySelectorAll('set')];
  return sets.length ? sets[sets.length - 1] : null;
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

function convert() {
  try {
    const deck = parseXml(state.text);
    const flavor = seriesSelect.value;
    const deckCards = [...deck.querySelectorAll('card[name]')];
    let proxies = 0;
    let fallbacks = 0;
    let untouched = 0;
    const notes = [];

    for (const deckCard of deckCards) {
      const name = cardName(deckCard);
      const quantity = cardQuantity(deckCard);
      const proxy = findProxy(name, flavor);
      if (proxy) {
        applyProxy(deckCard, proxy.set);
        proxies += quantity;
        continue;
      }
      if (isClm(deckCard)) {
        const fallback = latestPrinting(name);
        if (fallback) {
          applyFallback(deckCard, fallback);
          fallbacks += quantity;
          notes.push(`${name}: no ${SERIES[flavor]} proxy, restored latest printing`);
          continue;
        }
      }
      untouched += quantity;
    }

    const output = new XMLSerializer().serializeToString(deck);
    download(output, state.file.name);
    document.querySelector('#proxyCount').textContent = proxies;
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
    parseXml(state.text);
    if (!state.proxyXml) state.proxyXml = await loadReference('../lechugapod.xml');
    if (!state.savedXml) state.savedXml = await loadReference('https://raw.githubusercontent.com/Cockatrice/Cockatrice/refs/heads/master/tests/carddatabase/data/cards.xml');
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
