const SERIES_NAMES = {
  Arknights: 'Arknights',
  AzurLane: 'Azur Lane',
  BlueArchive: 'Blue Archive',
  Fate: 'Fate Grand Order',
  MAWS: 'My Adventures with Superman',
  ReZero: 'Re:Zero',
  Shakugan: 'Shakugan no Shana',
  Shadowverse: 'Shadowverse: Worlds Beyond',
  Touhou: 'Touhou Project',
  Honkai: 'Honkai: Star Rail',
  ZZZ: 'Zenless Zone Zero'
};

const CATEGORIES = [
  { key: 'cards', label: 'Creatures' },
  { key: 'planeswalkers', label: 'Planeswalkers' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'lands', label: 'Lands' },
  { key: 'tokens', label: 'Tokens' }
];

const state = { cards: [], category: 'cards', series: new Set(), search: '', sort: 'alphabetical', hideOc: true, imageQueue: [], queuedImages: new Set(), loadingImage: false, imageStatus: new Map(), imageObserver: null, modalCard: null };
const categoryTabs = document.querySelector('#categoryTabs');
const seriesTabs = document.querySelector('#seriesTabs');
const cardSearch = document.querySelector('#cardSearch');
const cardGrid = document.querySelector('#cardGrid');
const galleryTitle = document.querySelector('#galleryTitle');
const resultCount = document.querySelector('#resultCount');
const sortSelect = document.querySelector('#sortSelect');
const hideOcToggle = document.querySelector('#hideOcToggle');
const emptyState = document.querySelector('#emptyState');
const loadingStatus = document.querySelector('#loadingStatus');
const cardModal = document.querySelector('#cardModal');
const modalImage = document.querySelector('#modalImage');
const modalCaption = document.querySelector('#modalCaption');
const modalProxyCaption = document.querySelector('#modalProxyCaption');
const modalClose = document.querySelector('#modalClose');

function textContent(element, selector) {
  return element.querySelector(selector)?.textContent.trim() || '';
}

function fileName(url) {
  const name = decodeURIComponent(url.split('/').pop() || '').replace(/\.png$/i, '');
  return name;
}

function trackingMap(text) {
  return new Map(text.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(.+?)_(\d{4}|\d+X)\s*=\s*(.+)$/i);
    return match ? [[`${match[1].trim()}_${match[2]}`, match[3].trim()]] : [];
  }));
}

function artistMap(text) {
  const artists = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^\*\s+(.+?)\s+\|\s+\[([^\]]+)\]\(([^)]+)\)/);
    if (match) artists.set(normalize(match[1].replace(/\.png$/i, '')), { name: match[2], url: match[3] });
  }
  return artists;
}

function cardCategory(url) {
  const match = url.match(/\/assets\/(cards|planeswalkers|artifacts|lands|tokens)\//i);
  return match ? match[1].toLowerCase() : null;
}

function uuidSuffix(uuid) {
  const tokenSuffix = uuid.match(/^(?:00000000-0000-0000-)(\d{4})-X{12}$/i);
  if (tokenSuffix) return `${Number(tokenSuffix[1])}X`;
  const number = uuid.match(/(\d+)$/);
  return number ? number[1].padStart(4, '0').slice(-4) : '';
}

function normalize(value) {
  return value.normalize('NFC').replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

function releaseMap(text) {
  const releases = new Map();
  let date = '';
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^## (\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (heading) {
      date = `${heading[3]}-${heading[1].padStart(2, '0')}-${heading[2].padStart(2, '0')}`;
      continue;
    }
    const entry = line.match(/^\* (\d{1,2}):(\d{2}):(\d{2})\.(\d+) ([AP]M) [A-Z]+ - [^/]+ \/ ([^/]+) \/ /i);
    if (date && entry) {
      const hours = Number(entry[1]) % 12 + (entry[5].toUpperCase() === 'PM' ? 12 : 0);
      const time = `${String(hours).padStart(2, '0')}:${entry[2]}:${entry[3]}`;
      const milliseconds = entry[4].padEnd(3, '0').slice(0, 3);
      releases.set(normalize(entry[6]), `${date}T${time}.${milliseconds}`);
    }
  }
  return releases;
}

function parseCards(xmlText, tracking, releases, artists) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  return [...xml.querySelectorAll('card')].flatMap(card => {
    const originalName = textContent(card, 'name');
    return [...card.querySelectorAll('set[picurl]')].flatMap(set => {
      const image = set.getAttribute('picurl') || '';
      const category = cardCategory(image);
      if (!category) return [];
      const artworkName = fileName(image);
      const trackedName = tracking.get(`${originalName}_${uuidSuffix(set.getAttribute('uuid') || '')}`) || artworkName;
      return [{
        originalName,
        artworkName,
        trackedName,
        category,
        flavorName: set.getAttribute('flavorName') || '',
        series: SERIES_NAMES[set.getAttribute('flavorName')] || '',
        isOc: set.getAttribute('flavorName') === 'OC',
        uuid: set.getAttribute('uuid') || '',
        release: releases.get(normalize(artworkName)) || '0000-01-01T00:00:00',
        artist: artists.get(normalize(`${category}/${artworkName}`)) || null,
        image: image.replace('https://raw.githubusercontent.com/DarkSerpent/LechugaPod/refs/heads/main/', '../'),
        searchText: `${originalName} ${artworkName} ${trackedName}`.toLowerCase()
      }];
    });
  });
}

function renderTabs() {
  categoryTabs.innerHTML = CATEGORIES.map((category, index) => `<button class="filter-tab${index === 0 ? ' is-active' : ''}" type="button" role="tab" aria-selected="${index === 0}" data-category="${category.key}">${category.label}</button>`).join('');
  seriesTabs.innerHTML = `<button class="filter-tab is-active" type="button" aria-pressed="true" data-series="">All</button>${Object.entries(SERIES_NAMES).map(([key, label]) => `<button class="filter-tab" type="button" aria-pressed="false" data-series="${key}">${label}</button>`).join('')}`;
}

function filteredCards() {
  const cards = state.cards.filter(card => card.category === state.category && (!state.series.size || state.series.has(card.flavorName)) && (!state.hideOc || !card.isOc) && (!state.search || card.searchText.includes(state.search)));
  return cards.sort((first, second) => {
    if (state.sort === 'alphabetical') return first.trackedName.localeCompare(second.trackedName, undefined, { sensitivity: 'base' }) || first.uuid.localeCompare(second.uuid);
    if (state.sort === 'release') return second.release.localeCompare(first.release) || first.uuid.localeCompare(second.uuid);
    return first.uuid.localeCompare(second.uuid);
  });
}

function imageKey(card) {
  return card.image;
}

function enqueueImage(cardIndex, priority = false) {
  const card = state.cards[cardIndex];
  if (!card || state.imageStatus.get(imageKey(card)) === 'loaded' || state.imageStatus.get(imageKey(card)) === 'loading') return;
  if (state.queuedImages.has(cardIndex)) {
    if (priority) {
      state.imageQueue = state.imageQueue.filter(index => index !== cardIndex);
      state.imageQueue.unshift(cardIndex);
    }
  } else {
    state.queuedImages.add(cardIndex);
    if (priority) state.imageQueue.unshift(cardIndex);
    else state.imageQueue.push(cardIndex);
  }
  processImageQueue();
}

function processImageQueue() {
  if (state.loadingImage) return;
  const cardIndex = state.imageQueue.shift();
  if (cardIndex === undefined) return;
  state.queuedImages.delete(cardIndex);
  const card = state.cards[cardIndex];
  const image = cardGrid.querySelector(`img[data-card-index="${cardIndex}"]`);
  if (!card || !image) {
    processImageQueue();
    return;
  }
  state.loadingImage = true;
  state.imageStatus.set(imageKey(card), 'loading');
  const wrapper = image.closest('.card-image-wrap');
  image.addEventListener('load', () => {
    state.imageStatus.set(imageKey(card), 'loaded');
    state.loadingImage = false;
    cardGrid.querySelectorAll(`img[data-card-index="${cardIndex}"]`).forEach(currentImage => {
      currentImage.src = card.image;
      currentImage.closest('.card-image-wrap').classList.add('is-loaded');
    });
    if (state.modalCard === card) {
      modalImage.src = card.image;
      modalImage.classList.add('is-loaded');
      cardModal.classList.add('is-image-loaded');
    }
    processImageQueue();
  }, { once: true });
  image.addEventListener('error', () => {
    state.imageStatus.set(imageKey(card), 'failed');
    state.loadingImage = false;
    wrapper.classList.add('is-error');
    processImageQueue();
  }, { once: true });
  image.src = card.image;
}

function queueVisibleImages(entries) {
  entries.forEach(entry => {
    if (entry.isIntersecting) enqueueImage(Number(entry.target.dataset.cardIndex), true);
  });
}

function queueBackgroundImages(cards) {
  window.setTimeout(() => cards.forEach(card => enqueueImage(state.cards.indexOf(card))), 150);
}

function renderCards() {
  const cards = filteredCards();
  const category = CATEGORIES.find(item => item.key === state.category);
  galleryTitle.textContent = category.label;
  resultCount.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'}`;
  emptyState.hidden = cards.length > 0;
  state.imageQueue = [];
  state.queuedImages.clear();
  state.imageObserver?.disconnect();
  cardGrid.innerHTML = cards.map((card, index) => `<article class="card-tile" style="--card-index: ${index % 12}"><button class="card-button" type="button" data-card-index="${state.cards.indexOf(card)}" aria-label="Preview ${card.trackedName}"><span class="card-image-wrap" data-card-index="${state.cards.indexOf(card)}"><span class="image-spinner" aria-hidden="true"></span><img data-card-index="${state.cards.indexOf(card)}" alt="${card.trackedName}"><span class="zoom-icon" aria-hidden="true"></span></span><span class="card-name">${card.trackedName}</span><span class="card-series">${card.series || 'Uncategorized'}</span></button></article>`).join('');
  cards.forEach(card => {
    const cardIndex = state.cards.indexOf(card);
    const status = state.imageStatus.get(imageKey(card));
    if (status === 'loaded' || status === 'loading') {
      const image = cardGrid.querySelector(`img[data-card-index="${cardIndex}"]`);
      image.src = card.image;
      if (status === 'loaded') image.closest('.card-image-wrap').classList.add('is-loaded');
    }
  });
  state.imageObserver = new IntersectionObserver(queueVisibleImages, { rootMargin: '240px 0px' });
  cardGrid.querySelectorAll('.card-image-wrap').forEach(wrapper => state.imageObserver.observe(wrapper));
  queueBackgroundImages(cards);
}

function setSeries(series) {
  if (!series) state.series.clear();
  else if (state.series.has(series)) state.series.delete(series);
  else state.series.add(series);
  document.querySelectorAll('[data-series]').forEach(button => {
    const selected = button.dataset.series ? state.series.has(button.dataset.series) : !state.series.size;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', selected);
  });
  renderCards();
}

async function load() {
  try {
    const [xmlResponse, trackingResponse, patchnotesResponse, artistsResponse] = await Promise.all([fetch('../lechugapod.xml'), fetch('../assets/name_tracking.txt'), fetch('../assets/patchnotes.md'), fetch('../assets/artists.md')]);
    if (!xmlResponse.ok || !trackingResponse.ok || !patchnotesResponse.ok || !artistsResponse.ok) throw new Error('Card data could not be loaded.');
    state.cards = parseCards(await xmlResponse.text(), trackingMap(await trackingResponse.text()), releaseMap(await patchnotesResponse.text()), artistMap(await artistsResponse.text()));
    loadingStatus.textContent = `${state.cards.length} artworks loaded`;
    renderTabs();
    renderCards();
  } catch (error) {
    loadingStatus.textContent = error.message;
    emptyState.hidden = false;
    emptyState.textContent = 'Card data could not be loaded.';
  }
}

categoryTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.category = button.dataset.category;
  document.querySelectorAll('[data-category]').forEach(tab => {
    const selected = tab === button;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', selected);
  });
  renderCards();
});

seriesTabs.addEventListener('click', event => {
  const button = event.target.closest('[data-series]');
  if (button) setSeries(button.dataset.series);
});

cardSearch.addEventListener('input', event => {
  state.search = event.target.value.trim().toLowerCase();
  renderCards();
});

sortSelect.addEventListener('change', event => {
  state.sort = event.target.value;
  renderCards();
});

hideOcToggle.addEventListener('change', event => {
  state.hideOc = event.target.checked;
  renderCards();
});

cardGrid.addEventListener('click', event => {
  const button = event.target.closest('[data-card-index]');
  if (!button) return;
  const card = state.cards[button.dataset.cardIndex];
  state.modalCard = card;
  modalImage.classList.remove('is-loaded');
  cardModal.classList.remove('is-image-loaded');
  modalImage.alt = card.trackedName;
  modalCaption.replaceChildren(document.createTextNode(`${card.trackedName} · ${card.series || 'Uncategorized'}`));
  if (card.artist) {
    modalCaption.append(document.createTextNode(' · '));
    const artistLink = document.createElement('a');
    artistLink.href = card.artist.url;
    artistLink.target = '_blank';
    artistLink.rel = 'noopener noreferrer';
    artistLink.textContent = card.artist.name;
    modalCaption.append(artistLink);
  }
  modalProxyCaption.replaceChildren();
  const scryfallIcon = document.createElement('img');
  scryfallIcon.className = 'scryfall-favicon';
  scryfallIcon.src = 'https://scryfall.com/favicon.ico';
  scryfallIcon.alt = '';
  scryfallIcon.setAttribute('aria-hidden', 'true');
  const proxyLink = document.createElement('a');
  proxyLink.href = `http://scryfall.com/search?q=${encodeURIComponent(card.originalName)}`;
  proxyLink.target = '_blank';
  proxyLink.rel = 'noopener noreferrer';
  proxyLink.textContent = card.originalName;
  proxyLink.setAttribute('aria-label', `View ${card.originalName} on Scryfall`);
  modalProxyCaption.append(scryfallIcon);
  modalProxyCaption.append(proxyLink);
  cardModal.showModal();
  if (state.imageStatus.get(imageKey(card)) === 'loaded') {
    modalImage.src = card.image;
    modalImage.classList.add('is-loaded');
    cardModal.classList.add('is-image-loaded');
  } else {
    enqueueImage(Number(button.dataset.cardIndex), true);
  }
});

modalClose.addEventListener('click', () => cardModal.close());
cardModal.addEventListener('click', event => { if (event.target === cardModal) cardModal.close(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && cardModal.open) cardModal.close(); });

load();
