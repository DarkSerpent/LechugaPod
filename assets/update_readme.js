'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT_DIR = path.resolve(__dirname, '..');
const XML_PATH = path.join(ROOT_DIR, 'lechugapod.xml');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const TRACKING_PATH = path.join(__dirname, 'name_tracking.txt');

const SERIES_NAMES = {
    BlueArchive: 'Blue Archive',
    Fate: 'Fate Grand Order',
    ReZero: 'Re:Zero',
    Shakugan: 'Shakugan no Shana',
    Shadowverse: 'Shadowverse: Worlds Beyond',
    Touhou: 'Touhou Project',
    Honkai: 'Honkai: Star Rail'
};

const CATEGORY_NAMES = {
    Creature: 'Creature Cards',
    Planeswalker: 'Planeswalkers',
    Artifact: 'Artifact Cards',
    Battle: 'Battle Cards',
    Enchantment: 'Enchantment Cards',
    Instant: 'Instant Cards',
    Land: 'Lands',
    Token: 'Tokens'
};

function decodeEntities(value) {
    if (!value) return '';
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function tagContents(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? decodeEntities(match[1].trim()) : null;
}

function attribute(xml, name) {
    const match = xml.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return match ? decodeEntities(match[1]) : null;
}

function uuidNumber(uuid) {
    const match = uuid?.match(/(\d+)$/);
    return match ? Number(match[1]) : Infinity;
}

function uuidSuffix(uuid) {
    const number = uuidNumber(uuid);
    if (!Number.isFinite(number)) return null;
    return String(number).padStart(4, '0').slice(-4);
}

function proxyName(picurl) {
    let filename;
    try {
        filename = new URL(picurl).pathname.split('/').pop();
    } catch {
        filename = picurl.split('/').pop();
    }
    try {
        filename = decodeURIComponent(filename);
    } catch {}
    filename = filename.replace(/\.[^.]+$/, '');
    return decodeEntities(filename);
}

function categoryFor(maintype) {
    return CATEGORY_NAMES[maintype] ?? null;
}

function isTokenCard(cardXml) {
    const type = tagContents(cardXml, 'type') || '';
    return /^Token\b/i.test(type);
}

function parseTrackingFile(contents) {
    const tracking = new Map();
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const match = line.match(/^(.+?)_(\d{4})\s*=\s*(.+)$/);
        if (!match) {
            console.warn(`Ignoring malformed name_tracking.txt line: ${rawLine}`);
            continue;
        }
        const cardName = match[1].trim();
        const uuidSuffixValue = match[2];
        const trackedName = match[3].trim();
        tracking.set(`${cardName}_${uuidSuffixValue}`, trackedName);
    }
    return tracking;
}

function isCommander(cardXml) {
    const type = tagContents(cardXml, 'type') || '';
    const text = tagContents(cardXml, 'text') || '';
    if (type.includes('Legendary Creature')) return true;
    if (type.includes('Legendary Artifact Creature')) return true;
    if (type.includes('Legendary Artifact — Spacecraft')) return true;
    if (text.includes('can be your commander')) return true;
    return false;
}

function askCustomName(rl, defaultName) {
    return new Promise(resolve => {
        rl.question(`Define a custom name for "${defaultName}" (press ENTER to use the default): `, answer => {
            resolve(answer.trim() || defaultName);
        });
    });
}

async function parseCards(xml, tracking, rl) {
    const cards = [];
    const cardMatches = xml.match(/<card\b[\s\S]*?<\/card>/gi) || [];
    const newTrackingEntries = [];
    
    for (const cardXml of cardMatches) {
        const name = tagContents(cardXml, 'name');
        const prop = tagContents(cardXml, 'prop');
        if (!name || !prop) continue;
        const maintype = tagContents(prop, 'maintype');
        const isToken = isTokenCard(cardXml);
        const category = isToken ? CATEGORY_NAMES.Token : categoryFor(maintype);
        if (!category) continue;
        const layout = tagContents(prop, 'layout') || 'normal';
        const isCommanderCard = isCommander(cardXml);
        const sets = cardXml.match(/<set\b[^>]*>[\s\S]*?<\/set>/gi) || [];
        for (const setXml of sets) {
            const flavorName = attribute(setXml, 'flavorName');
            const picurl = attribute(setXml, 'picurl');
            const uuid = attribute(setXml, 'uuid');
            const num = attribute(setXml, 'num');
            if (!picurl || !uuid) continue;
            const suffix = uuidSuffix(uuid);
            if (!suffix && !isToken) {
                console.warn(`Skipping "${name}": invalid UUID "${uuid}".`);
                continue;
            }
            const trackingKey = `${name}_${suffix || '0000'}`;
            let trackedName = tracking.get(trackingKey);
            if (!trackedName) {
                const defaultName = proxyName(picurl);
                trackedName = await askCustomName(rl, defaultName);
                tracking.set(trackingKey, trackedName);
                newTrackingEntries.push({ key: trackingKey, value: trackedName });
                console.log(`Added missing tracking entry: ${trackingKey} = ${trackedName}`);
            }
            let seriesName = null;
            let isOC = false;
            if (flavorName === 'OC') {
                isOC = true;
                seriesName = "Friend's OC";
            } else {
                seriesName = SERIES_NAMES[flavorName];
                if (!seriesName) {
                    console.warn(`Skipping "${name}": unknown flavorName "${flavorName}".`);
                    continue;
                }
            }
            cards.push({
                name,
                maintype,
                category,
                seriesName,
                flavorName,
                picurl,
                proxyName: proxyName(picurl),
                uuid,
                uuidSuffix: suffix,
                release: uuidNumber(uuid),
                trackedName,
                layout,
                num: num || null,
                isOC,
                isCommander: isCommanderCard,
                isToken,
                reverseRelated: isToken ? tagContents(cardXml, 'reverse-related') : null,
                cardXml
            });
        }
    }
    
    if (newTrackingEntries.length > 0) {
        const lines = [];
        for (const [key, value] of tracking) {
            lines.push(`${key} = ${value}`);
        }
        fs.writeFileSync(TRACKING_PATH, lines.join('\n') + '\n', 'utf8');
        console.log(`Added ${newTrackingEntries.length} new entries to name_tracking.txt`);
    }
    
    return cards;
}

function groupDfcCards(cards) {
    const groups = new Map();
    const standalone = [];
    for (const card of cards) {
        if (card.layout === 'modal_dfc' && card.num) {
            if (!groups.has(card.num)) groups.set(card.num, []);
            groups.get(card.num).push(card);
        } else {
            standalone.push(card);
        }
    }
    const combined = [];
    for (const [num, group] of groups) {
        group.sort((a, b) => a.release - b.release);
        const front = group[0];
        const combinedCard = {
            isDfc: true,
            isOC: front.isOC,
            isCommander: group.some(c => c.isCommander),
            parts: group.map(c => ({
                name: c.name,
                trackedName: c.trackedName,
                picurl: c.picurl,
                isCommander: c.isCommander
            })),
            name: group.map(c => c.name).join(' // '),
            trackedName: group.map(c => c.trackedName).join(' // '),
            picurl: group.map(c => c.picurl).join(' // '),
            seriesName: front.seriesName,
            flavorName: front.flavorName,
            category: front.category,
            release: Math.min(...group.map(c => c.release)),
            uuid: front.uuid,
            uuidSuffix: front.uuidSuffix,
            cardXml: front.cardXml
        };
        combined.push(combinedCard);
    }
    for (const card of standalone) {
        combined.push({ ...card, isDfc: false });
    }
    return combined;
}

function makeBullet(card) {
    let bullet;
    if (card.isDfc) {
        const names = card.parts.map(p => p.name).join(' // ');
        const links = card.parts.map(p => `[${p.trackedName}](${p.picurl})`).join(' // ');
        if (card.isCommander) {
            bullet = `* ${names}[^1] = ${links} (${card.seriesName})`;
        } else {
            bullet = `* ${names} = ${links} (${card.seriesName})`;
        }
    } else {
        if (card.isCommander) {
            bullet = `* ${card.name}[^1] = [${card.trackedName}](${card.picurl}) (${card.seriesName})`;
        } else {
            bullet = `* ${card.name} = [${card.trackedName}](${card.picurl}) (${card.seriesName})`;
        }
    }
    return bullet;
}

function makeBulletLines(card) {
    const bullet = makeBullet(card);
    if (!card.isToken || !card.reverseRelated) return [bullet];
    return [bullet, `   * Linked to: *${card.reverseRelated}*`];
}

function findSeriesHeading(lines, category, series) {
    const categoryHeading = `## ${category}`;
    let inCategory = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === categoryHeading) {
            inCategory = true;
            continue;
        }
        if (inCategory && lines[i].startsWith('## ')) return -1;
        if (inCategory && lines[i].match(new RegExp(`^### ${escapeRegex(series)} \\\`\\d+\\\`$`))) return i;
    }
    return -1;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCategoryEnd(lines, categoryIndex) {
    for (let i = categoryIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith('## ')) return i;
    }
    return lines.length;
}

function findSeriesEnd(lines, headingIndex) {
    for (let i = headingIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith('### ') || lines[i].startsWith('## ')) return i;
        if (lines[i].startsWith('<details>')) return i;
    }
    return lines.length;
}

function buildBulletReleaseMap(cards) {
    const map = new Map();
    for (const card of cards) {
        const bullet = makeBullet(card);
        if (!map.has(bullet)) map.set(bullet, card.release);
    }
    return map;
}

function cardExistsInReadme(lines, card) {
    const bullet = makeBullet(card);
    const bulletWithoutFootnote = bullet.replace('[^1]', '');
    for (const line of lines) {
        if (line === bullet || line === bulletWithoutFootnote) return true;
        if (line.startsWith('* ') && line.includes(card.name) && line.includes(card.seriesName)) {
            const lineClean = line.replace('[^1]', '');
            if (lineClean === bulletWithoutFootnote) return true;
        }
    }
    return false;
}

function insertNewSeries(lines, category, series, bullet) {
    let categoryIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === `## ${category}`) {
            categoryIndex = i;
            break;
        }
    }
    if (categoryIndex === -1) throw new Error(`README is missing "## ${category}".`);
    const categoryEnd = findCategoryEnd(lines, categoryIndex);
    for (let i = categoryIndex + 1; i < categoryEnd; i++) {
        const match = lines[i].match(/^### (.+?) `\d+`$/);
        if (!match) continue;
        if (match[1].localeCompare(series, undefined, { sensitivity: 'base' }) > 0) {
            lines.splice(i, 0, `### ${series} \`1\``, ...bullet.split('\n'));
            return;
        }
    }
    lines.splice(categoryEnd, 0, `### ${series} \`1\``, ...bullet.split('\n'));
}

function insertIntoSeries(lines, headingIndex, card, bulletReleaseMap) {
    const end = findSeriesEnd(lines, headingIndex);
    let lastBulletIndex = headingIndex;
    const bullet = makeBullet(card);
    for (let i = headingIndex + 1; i < end; i++) {
        if (!lines[i].startsWith('* ')) continue;
        const existingRelease = bulletReleaseMap.get(lines[i]);
        if (existingRelease !== undefined && existingRelease > card.release) {
            lines.splice(i, 0, ...makeBulletLines(card));
            return;
        }
        lastBulletIndex = i;
    }
    lines.splice(lastBulletIndex + 1, 0, ...bullet.split('\n'));
}

function updateTokenLinks(lines, cards) {
    for (const card of cards.filter(candidate => candidate.isToken && candidate.reverseRelated)) {
        const bullet = makeBullet(card);
        const linkLine = `   * Linked to: *${card.reverseRelated}*`;
        const bulletIndex = lines.indexOf(bullet);
        if (bulletIndex === -1) continue;
        if (lines[bulletIndex + 1]?.startsWith('   * Linked to:')) {
            lines[bulletIndex + 1] = linkLine;
        } else if (lines[bulletIndex + 1] !== linkLine) {
            lines.splice(bulletIndex + 1, 0, linkLine);
        }
    }
}

function getCurrentTotal(lines) {
    const pattern = /Collection currently at <img src="https:\/\/img\.shields\.io\/badge\/(\d+)-88E788/;
    for (const line of lines) {
        const match = line.match(pattern);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

function updateTotalCount(lines, totalCards) {
    const pattern = /(Collection currently at <img src="https:\/\/img\.shields\.io\/badge\/)\d+(-88E788[^"]*".*?cards\.)/;
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(pattern);
        if (match) {
            lines[i] = lines[i].replace(/\d+(?=-88E788)/, String(totalCards));
            return true;
        }
    }
    console.warn('Could not find the total card count line in README.md; count not updated.');
    return false;
}

function computeExpectedCounts(rawCards) {
    const counts = new Map();
    for (const card of rawCards) {
        if (card.isOC) continue;
        const key = `${card.category}||${card.seriesName}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function updateSeriesCounts(lines, expectedCounts) {
    const changes = [];
    let currentCategory = null;
    let inDetails = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('## ')) {
            const categoryMatch = line.match(/^## (.+?)(?: `(\d+)`)?$/);
            currentCategory = categoryMatch ? categoryMatch[1].trim() : line.replace(/^## /, '').trim();
            inDetails = false;
            if (categoryMatch && categoryMatch[2] !== undefined) {
                const prefix = `${currentCategory}||`;
                const expected = [...expectedCounts.entries()]
                    .filter(([key]) => key.startsWith(prefix))
                    .reduce((total, [, count]) => total + count, 0);
                const currentCount = parseInt(categoryMatch[2], 10);
                if (currentCount !== expected) {
                    lines[i] = line.replace(/`\d+`$/, `\`${expected}\``);
                    changes.push({ category: currentCategory, old: currentCount, new: expected });
                }
            }
            continue;
        }
        if (line.startsWith('<details>')) {
            inDetails = true;
            continue;
        }
        if (line.startsWith('</details>')) {
            inDetails = false;
            continue;
        }
        if (inDetails) continue;
        const headingMatch = line.match(/^### (.+?) `(\d+)`$/);
        if (headingMatch && currentCategory) {
            const seriesName = headingMatch[1].trim();
            const currentCount = parseInt(headingMatch[2], 10);
            const key = `${currentCategory}||${seriesName}`;
            const expected = expectedCounts.get(key) || 0;
            if (currentCount !== expected) {
                lines[i] = line.replace(/`\d+`$/, `\`${expected}\``);
                changes.push({ series: seriesName, category: currentCategory, old: currentCount, new: expected });
            }
        }
    }
    return changes;
}

function fixFootnotes(lines, cards) {
    const changes = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('* ')) continue;
        for (const card of cards) {
            const expectedBullet = makeBullet(card);
            const expectedWithoutFootnote = expectedBullet.replace('[^1]', '');
            const lineWithoutFootnote = line.replace('[^1]', '');
            if (lineWithoutFootnote === expectedWithoutFootnote) {
                if (card.isCommander && !line.includes('[^1]')) {
                    lines[i] = expectedBullet;
                    changes.push({ card: card.name, action: 'added footnote' });
                } else if (!card.isCommander && line.includes('[^1]')) {
                    lines[i] = expectedBullet;
                    changes.push({ card: card.name, action: 'removed footnote' });
                }
                break;
            }
        }
    }
    return changes;
}

async function main() {
    console.log('====================================');
    console.log(' LechugaPod README Updater');
    console.log('====================================');
    console.log('');

    if (!fs.existsSync(XML_PATH)) throw new Error(`Could not find:\n${XML_PATH}`);
    if (!fs.existsSync(README_PATH)) throw new Error(`Could not find:\n${README_PATH}`);
    if (!fs.existsSync(TRACKING_PATH)) throw new Error(`Could not find:\n${TRACKING_PATH}`);

    const xml = fs.readFileSync(XML_PATH, 'utf8');
    const originalReadme = fs.readFileSync(README_PATH, 'utf8');
    const tracking = parseTrackingFile(fs.readFileSync(TRACKING_PATH, 'utf8'));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: process.stdin.isTTY,
        historySize: 50
    });

    let rawCards;
    try {
        rawCards = await parseCards(xml, tracking, rl);
    } finally {
        rl.close();
    }
    const totalCards = rawCards.filter(card => !card.isToken).length;

    const regularCards = rawCards.filter(c => !c.isOC);
    const groupedRegular = groupDfcCards(regularCards);
    groupedRegular.sort((a, b) => a.release - b.release);

    const bulletReleaseMap = buildBulletReleaseMap(groupedRegular);
    let lines = originalReadme.split(/\r?\n/);

    const added = [];
    for (const card of groupedRegular) {
        if (cardExistsInReadme(lines, card)) continue;
        const headingIndex = findSeriesHeading(lines, card.category, card.seriesName);
        if (headingIndex === -1) {
            insertNewSeries(lines, card.category, card.seriesName, makeBulletLines(card).join('\n'));
        } else {
            insertIntoSeries(lines, headingIndex, card, bulletReleaseMap);
        }
        added.push(card);
        bulletReleaseMap.set(makeBullet(card), card.release);
    }

    updateTokenLinks(lines, groupedRegular);

    if (added.length > 0) {
        console.log(`Added ${added.length} new entr${added.length === 1 ? 'y' : 'ies'}:`);
        for (const card of added) {
            if (card.isDfc) {
                const parts = card.parts.map(p => `${p.name} [${p.trackedName}]`).join(' // ');
                console.log(`  ${parts} (${card.seriesName})`);
            } else {
                console.log(`  ${card.name} [${card.uuidSuffix}] = ${card.trackedName} (${card.seriesName})`);
            }
        }
        console.log('');
        console.log('README.md updated with new entries.');
    } else {
        console.log('No new series cards found.');
    }

    const footnoteChanges = fixFootnotes(lines, groupedRegular);
    if (footnoteChanges.length > 0) {
        console.log('Footnote corrections:');
        for (const ch of footnoteChanges) {
            console.log(`  ${ch.card}: ${ch.action}`);
        }
        console.log('');
    }

    const oldTotal = getCurrentTotal(lines) || 0;
    const expectedCounts = computeExpectedCounts(rawCards);
    const seriesChanges = updateSeriesCounts(lines, expectedCounts);

    let totalChanged = false;
    if (oldTotal !== totalCards) {
        totalChanged = true;
        updateTotalCount(lines, totalCards);
    }

    if (seriesChanges.length > 0 || totalChanged || added.length > 0 || footnoteChanges.length > 0) {
        fs.writeFileSync(README_PATH, lines.join('\n'), 'utf8');
        if (seriesChanges.length > 0) {
            console.log('Series counts updated:');
            for (const ch of seriesChanges) {
                console.log(`  ${ch.category} → ${ch.series}: ${ch.old} → ${ch.new}`);
            }
        }
        if (totalChanged) {
            console.log(`Total card count updated: ${oldTotal} → ${totalCards}`);
        }
        console.log('README.md updated with corrections.');
    } else {
        console.log('No corrections needed.');
    }

    console.log('Done.');
}

try {
    main().catch(error => {
        console.error(`ERROR: ${error.message}`);
        process.exit(1);
    });
} catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
}