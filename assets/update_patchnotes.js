'use strict';

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = __dirname;
const ROOT_DIR = path.resolve(ASSETS_DIR, '..');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const TRACKING_PATH = path.join(ASSETS_DIR, 'name_tracking.txt');
const PATCHNOTES_PATH = path.join(ASSETS_DIR, 'patchnotes.md');
const TIME_ZONE = 'America/Chicago';
const IMAGE_DIRECTORIES = new Set(['cards', 'artifacts', 'lands', 'planeswalkers']);

function normalize(value) {
    return value
        .normalize('NFC')
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function decodeUrl(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function relativeAssetPath(filePath) {
    return path.relative(ASSETS_DIR, filePath).replace(/\\/g, '/');
}

function findImages(directory = ASSETS_DIR) {
    const images = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (IMAGE_DIRECTORIES.has(entry.name)) images.push(...findImages(filePath));
        } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') {
            images.push(filePath);
        }
    }
    return images;
}

function imageNameFromUrl(url) {
    const lastPart = url.split('/').pop();
    return decodeUrl(lastPart).replace(/\.png$/i, '');
}

function readTrackingNames() {
    const names = new Map();
    if (!fs.existsSync(TRACKING_PATH)) return names;
    for (const line of fs.readFileSync(TRACKING_PATH, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^.+?_\d{4}\s*=\s*(.+)$/);
        if (match) names.set(normalize(match[1]), match[1].trim());
    }
    return names;
}

function parseMarkdownCards(readme) {
    const cards = [];
    for (const line of readme.split(/\r?\n/)) {
        if (!/^\* /.test(line) || !line.includes(' = ')) continue;
        const separator = line.indexOf(' = ');
        const cardName = line.slice(2, separator).replace(/\[\^\d+\]$/g, '').trim();
        const seriesMatch = line.match(/\(([^()]*)\)\s*$/);
        const series = seriesMatch ? seriesMatch[1].trim() : null;
        if (!series) continue;
        const imageLinks = [...line.matchAll(/\[([^\]]+)\]\(https?:\/\/\S+?\.png/gi)];
        for (const imageLink of imageLinks) {
            cards.push({
                cardName,
                series,
                imageName: imageNameFromUrl(imageLink[0].match(/https?:\/\/\S+?\.png/i)[0]),
                trackedName: imageLink[1].trim()
            });
        }
    }
    return cards;
}

function parseOcCards(readme) {
    const cards = [];
    const pattern = /<li>\s*([^=]+?)\s*=\s*([^()]+?)\s*\(Friend's OC\)\s*<\/li>/g;
    let match;
    while ((match = pattern.exec(readme)) !== null) {
        cards.push({
            cardName: match[1].trim(),
            series: "Friend's OC",
            imageName: match[2].trim(),
            trackedName: match[2].trim()
        });
    }
    return cards;
}

function matchImages(cards, imagePaths) {
    const byName = new Map();
    for (const imagePath of imagePaths) {
        const imageName = path.basename(imagePath, path.extname(imagePath));
        const key = normalize(imageName);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(imagePath);
    }

    return cards.flatMap(card => {
        let matches = byName.get(normalize(card.imageName)) || [];
        if (matches.length === 0) {
            const seriesKey = normalize(card.series).split(/[ :]/)[0];
            matches = imagePaths.filter(imagePath => {
                const imageName = path.basename(imagePath, path.extname(imagePath));
                const baseName = imageName.replace(/\s*\([^)]*\)$/, '');
                return normalize(baseName) === normalize(card.cardName) &&
                    normalize(imageName).includes(`(${seriesKey}`);
            });
        }
        if (matches.length === 0) {
            console.warn(`Could not find PNG for README card: ${card.cardName} = ${card.imageName}`);
            return [];
        }
        return matches.map(imagePath => ({ ...card, imagePath }));
    });
}

function formatDate(timestamp) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE,
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.month}/${values.day}/${values.year}`;
}

function formatTime(timestamp) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const milliseconds = String(new Date(timestamp).getMilliseconds()).padStart(3, '0');
    return `${values.hour}:${values.minute}:${values.second}.${milliseconds} ${values.dayPeriod} ${values.timeZoneName}`;
}

function parseExistingPatchnotes(contents) {
    const recordedNames = new Set();
    const sections = new Map();
    let preamble = [];
    let currentDate = null;

    for (const line of contents.split(/\r?\n/)) {
        const heading = line.match(/^## (\d{1,2}\/\d{1,2}\/\d{4})\s*$/);
        if (heading) {
            currentDate = heading[1];
            if (!sections.has(currentDate)) sections.set(currentDate, []);
            continue;
        }
        if (currentDate === null) {
            if (line.trim()) preamble.push(line);
            continue;
        }
        if (line.trim()) {
            sections.get(currentDate).push(line);
            const bullet = line.match(/^\* \d{1,2}:\d{2}:\d{2}\.\d{3} (?:AM|PM) (?:CDT|CST) - (.+)$/i);
            if (bullet) recordedNames.add(normalize(bullet[1]));
        }
    }

    return { preamble, sections, recordedNames };
}

function timestampFromBullet(line) {
    const match = line.match(/^\* (\d{1,2}:\d{2}:\d{2}\.\d{3} (?:AM|PM) (?:CDT|CST)) -/i);
    return match ? Date.parse(`1/1/1970 ${match[1]}`) : Number.MAX_SAFE_INTEGER;
}

function dateSortValue(date) {
    const [month, day, year] = date.split('/').map(Number);
    return new Date(year, month - 1, day).getTime();
}

function makeBullet(card, timestamp, trackingNames) {
    const imageName = path.basename(card.imagePath, path.extname(card.imagePath));
    const properName = trackingNames.get(normalize(card.trackedName)) || card.trackedName || imageName;
    return `* ${formatTime(timestamp)} - ${imageName} / ${properName}`;
}

function updatePatchnotes() {
    if (!fs.existsSync(README_PATH)) throw new Error(`Could not find ${README_PATH}`);

    const readme = fs.readFileSync(README_PATH, 'utf8');
    const imagePaths = findImages();
    const trackingNames = readTrackingNames();
    const cards = matchImages([
        ...parseMarkdownCards(readme),
        ...parseOcCards(readme)
    ], imagePaths);
    const contents = fs.existsSync(PATCHNOTES_PATH)
        ? fs.readFileSync(PATCHNOTES_PATH, 'utf8')
        : '';
    const patchnotes = parseExistingPatchnotes(contents);
    const additions = [];

    for (const card of cards) {
        const imageName = path.basename(card.imagePath, path.extname(card.imagePath));
        const properName = trackingNames.get(normalize(card.trackedName)) || card.trackedName || imageName;
        const recordedName = `${imageName} / ${properName}`;
        if (patchnotes.recordedNames.has(normalize(recordedName))) continue;
        const timestamp = fs.statSync(card.imagePath).mtimeMs;
        const date = formatDate(timestamp);
        if (!patchnotes.sections.has(date)) patchnotes.sections.set(date, []);
        patchnotes.sections.get(date).push(makeBullet(card, timestamp, trackingNames));
        patchnotes.recordedNames.add(normalize(recordedName));
        additions.push({ recordedName, timestamp });
    }

    for (const lines of patchnotes.sections.values()) {
        lines.sort((a, b) => timestampFromBullet(b) - timestampFromBullet(a));
    }

    const output = [];
    if (patchnotes.preamble.length > 0) output.push(...patchnotes.preamble, '');
    const dates = [...patchnotes.sections.keys()].sort((a, b) => dateSortValue(b) - dateSortValue(a));
    for (const date of dates) {
        output.push(`## ${date}`, ...patchnotes.sections.get(date), '');
    }

    fs.writeFileSync(PATCHNOTES_PATH, output.join('\n').replace(/\n+$/, '\n'), 'utf8');
    console.log(`Patchnotes updated: ${additions.length} new card${additions.length === 1 ? '' : 's'} recorded.`);
}

try {
    updatePatchnotes();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
