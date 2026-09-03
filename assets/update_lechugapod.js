'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT_DIR = path.resolve(__dirname, '..');
const XML_PATH = path.join(ROOT_DIR, 'lechugapod.xml');
const SAVED_CARDS_PATH = path.join(ROOT_DIR, 'saved', 'cards.xml');
const SAVED_TOKENS_PATH = path.join(ROOT_DIR, 'saved', 'tokens.xml');
const UUID_SUFFIX_LENGTH = 12;
const MAX_UUID_SUFFIX = (10 ** UUID_SUFFIX_LENGTH) - 1;

const SERIES_NAMES = [
    { key: 'Arknights', label: 'Arknights' },
    { key: 'AzurLane', label: 'Azur Lane' },
    { key: 'BlueArchive', label: 'Blue Archive' },
    { key: 'Fate', label: 'Fate Grand Order' },
    { key: 'ReZero', label: 'Re:Zero' },
    { key: 'Shakugan', label: 'Shakugan no Shana' },
    { key: 'Shadowverse', label: 'Shadowverse: Worlds Beyond' },
    { key: 'Touhou', label: 'Touhou Project' },
    { key: 'Honkai', label: 'Honkai: Star Rail' },
    { key: 'ZZZ', label: 'Zenless Zone Zero' },
    { key: null, label: 'Unsorted' }
];

const CARD_TYPES = [
    { value: 'Creature', label: 'creature', folder: 'cards' },
    { value: 'Planeswalker', label: 'planeswalker', folder: 'planeswalkers' },
    { value: 'Artifact', label: 'artifact', folder: 'artifacts' },
    { value: 'Instant', label: 'instant', folder: 'instants' },
    { value: 'Sorcery', label: 'sorcery', folder: 'sorceries' },
    { value: 'Land', label: 'land', folder: 'lands' }
];

const TOKEN_FLAVOR_SUFFIXES = {
    Arknights: 'AK',
    AzurLane: 'AL',
    BlueArchive: 'BA',
    Fate: 'FGO',
    ReZero: 'RZ',
    Shakugan: 'SnS',
    Shadowverse: 'SWB',
    Touhou: 'TP',
    Honkai: 'HSR',
    ZZZ: 'ZZZ'
};

function decodeEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function encodeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function normalize(value) {
    return value
        .normalize('NFC')
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLowerCase();
}

function tagValue(block, tag) {
    const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return match ? decodeEntities(match[1].trim()) : '';
}

function cardBlocks(xml) {
    return xml.match(/<card\b[\s\S]*?<\/card>/gi) || [];
}

function fuzzyScore(query, name) {
    const normalizedQuery = normalize(query);
    const normalizedName = normalize(name);
    if (normalizedName === normalizedQuery) return 10000;
    if (normalizedName.startsWith(normalizedQuery)) return 8000 - normalizedName.length;
    if (normalizedName.includes(normalizedQuery)) return 6000 - normalizedName.length;

    const queryWords = normalizedQuery.split(' ');
    const nameWords = new Set(normalizedName.split(' '));
    const matchedWords = queryWords.filter(word => nameWords.has(word)).length;
    if (matchedWords > 0) return matchedWords * 1000 - normalizedName.length;

    let score = 0;
    let position = 0;
    for (const character of normalizedQuery) {
        position = normalizedName.indexOf(character, position);
        if (position === -1) return 0;
        score += 1;
        position += 1;
    }
    return score;
}

function findMatches(query, blocks) {
    return blocks
        .map(block => ({ block, name: tagValue(block, 'name'), score: fuzzyScore(query, tagValue(block, 'name')) }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function ask(rl, question) {
    return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function chooseMatch(rl, query, matches, isToken = false) {
    const bestScore = matches[0]?.score || 0;
    const bestMatches = matches.filter(match => match.score === bestScore);
    if (bestMatches.length === 1 && bestScore >= 6000) return bestMatches[0];

    const options = matches.slice(0, 20);
    if (options.length === 0) throw new Error(`No saved card matched "${query}".`);
    console.log('Your search returned multiple results:');
    options.forEach((match, index) => {
        const label = isToken
            ? `${match.name} - ${tagValue(match.block, 'pt') || '0'} - ${tagValue(match.block, 'manacost') || '0'}`
            : match.name;
        console.log(`[${index + 1}] ${label}`);
    });
    while (true) {
        const answer = Number(await ask(rl, 'Choose the card number: '));
        if (Number.isInteger(answer) && answer >= 1 && answer <= options.length) return options[answer - 1];
        console.log(`Please choose a number from 1 to ${options.length}.`);
    }
}

function chooseByNumber(rl, question, options) {
    return (async () => {
        options.forEach((option, index) => console.log(`[${index + 1}] ${option.label}`));
        while (true) {
            const answer = Number(await ask(rl, question));
            if (Number.isInteger(answer) && answer >= 1 && answer <= options.length) return options[answer - 1];
            console.log(`Please choose a number from 1 to ${options.length}.`);
        }
    })();
}

function cardTypeFromBlock(block) {
    const maintype = tagValue(block, 'maintype');
    return CARD_TYPES.find(type => normalize(type.value) === normalize(maintype)) || null;
}

function seriesFromImageName(imageName) {
    const normalizedImageName = normalize(imageName);
    return SERIES_NAMES
        .filter(series => series.key)
        .find(series => normalizedImageName.includes(normalize(series.label)) || normalizedImageName.includes(normalize(series.key))) || null;
}

function findExistingCard(xml, name) {
    return cardBlocks(xml).find(block => normalize(tagValue(block, 'name')) === normalize(name));
}

function highestUuid(xml) {
    return Math.max(0, ...[...xml.matchAll(/uuid="[^"]*?(\d+)"/gi)].map(match => Number(match[1])).filter(Number.isFinite));
}

function nextUuid(xml) {
    const next = highestUuid(xml) + 1;
    if (next > MAX_UUID_SUFFIX) throw new Error('No UUID suffixes remain.');
    return String(next).padStart(UUID_SUFFIX_LENGTH, '0');
}

function nextTokenUuid(xml) {
    const tokenUuids = [...xml.matchAll(/uuid="00000000-0000-0000-(\d{4})-X{12}"/gi)]
        .map(match => Number(match[1]))
        .filter(Number.isFinite);
    const next = Math.max(0, ...tokenUuids) + 1;
    if (next > 9999) throw new Error('No token UUIDs remain.');
    return String(next).padStart(4, '0');
}

function addSetTag(block, setTag) {
    const tablerow = block.search(/^\s*<tablerow\b/m);
    if (tablerow !== -1) return `${block.slice(0, tablerow)}${setTag}\n${block.slice(tablerow)}`;
    return block.replace(/\n\s*<\/card>\s*$/, `\n${setTag}\n        </card>`);
}

function clearSetTags(block) {
    return block.replace(/^[ \t]*<set\b[^>]*>[\s\S]*?<\/set>[ \t]*(?:\r?\n|$)/gim, '');
}

function clearReverseRelatedTags(block) {
    return block.replace(/^[ \t]*<reverse-related\b[^>]*>[\s\S]*?<\/reverse-related>[ \t]*(?:\r?\n|$)/gim, '');
}

function renameCard(block, name) {
    return block.replace(/(<name>)[\s\S]*?(<\/name>)/i, `$1${encodeXml(name)}$2`);
}

function tokenNameWithSuffix(name, flavorName) {
    const suffix = TOKEN_FLAVOR_SUFFIXES[flavorName];
    if (!suffix) throw new Error(`Could not determine the flavor suffix for token "${name}".`);
    return `${name} (${suffix})`;
}

function addReverseRelatedTag(block, cardName) {
    const tablerow = block.search(/^\s*<tablerow\b/m);
    const tag = `            <reverse-related>${encodeXml(cardName)}</reverse-related>`;
    if (tablerow !== -1) return `${block.slice(0, tablerow)}${tag}\n${block.slice(tablerow)}`;
    return block.replace(/\n\s*<\/card>\s*$/, `\n${tag}\n        </card>`);
}

function normalizeCardIndentation(block) {
    const lines = block.trim().split(/\r?\n/);
    lines[0] = `        ${lines[0].trim()}`;
    lines[lines.length - 1] = `        ${lines[lines.length - 1].trim()}`;
    return lines.join('\n');
}

function imageUrl(folder, imageName) {
    const encodedName = encodeURIComponent(`${imageName}.png`);
    return `https://raw.githubusercontent.com/DarkSerpent/LechugaPod/refs/heads/main/assets/${folder}/${encodedName}`;
}

function findImagePath(folder, imageName) {
    const names = new Set([
        imageName,
        imageName.replace(/'/g, '’'),
        imageName.replace(/’/g, "'")
    ]);
    for (const name of names) {
        const imagePath = path.join(__dirname, folder, `${name}.png`);
        if (fs.existsSync(imagePath)) return imagePath;
    }
    return null;
}

function insertCard(xml, block) {
    const closingCards = xml.lastIndexOf('</cards>');
    if (closingCards === -1) throw new Error('Could not find </cards> in lechugapod.xml.');
    const before = xml.slice(0, closingCards).replace(/\s*$/, '');
    const after = xml.slice(closingCards);
    return `${before}\n\n${block}\n\n${after}`;
}

async function main() {
    if (!fs.existsSync(XML_PATH)) throw new Error(`Could not find ${XML_PATH}.`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: process.stdin.isTTY,
        historySize: 50
    });
    try {
        const xml = fs.readFileSync(XML_PATH, 'utf8');
        const itemType = await chooseByNumber(rl, 'Which item do you want to import? ', [
            { value: 'card', label: 'Card' },
            { value: 'token', label: 'Token' }
        ]);
        const isToken = itemType.value === 'token';
        const savedPath = isToken ? SAVED_TOKENS_PATH : SAVED_CARDS_PATH;
        if (!fs.existsSync(savedPath)) throw new Error(`Could not find ${savedPath}.`);
        const savedXml = fs.readFileSync(savedPath, 'utf8');
        const savedBlocks = cardBlocks(savedXml);
        const query = await ask(rl, `What is the name of the ${isToken ? 'token' : 'card'} you want to proxy? `);
        if (!query) throw new Error(`A ${isToken ? 'token' : 'card'} name is required.`);

        const existingMatch = isToken ? null : findExistingCard(xml, query);
        const savedMatch = existingMatch
            ? { block: existingMatch, name: tagValue(existingMatch, 'name') }
            : await chooseMatch(rl, query, findMatches(query, savedBlocks), isToken);
        const savedName = savedMatch.name;
        const detectedType = isToken ? null : cardTypeFromBlock(savedMatch.block);
        const type = isToken
            ? { folder: 'tokens' }
            : detectedType || await chooseByNumber(rl, 'What type is your card? ', CARD_TYPES);
        const imageInput = await ask(rl, `What is the name of the ${isToken ? 'token' : 'card'} image? `);
        if (!imageInput) throw new Error('A card image name is required.');
        const imageName = imageInput.replace(/\.png$/i, '');
        const imagePath = findImagePath(type.folder, imageName);
        if (!imagePath) throw new Error(`Could not find ${path.join(__dirname, type.folder, `${imageName}.png`)}.`);
        const actualImageName = path.basename(imagePath, path.extname(imagePath));

        const detectedSeries = seriesFromImageName(actualImageName);
        const series = detectedSeries || await chooseByNumber(rl, 'Which flavor set is your card from? ', SERIES_NAMES);
        let workingXml = xml;
        let existingBlock = existingMatch || findExistingCard(xml, savedName);
        let sourceBlock = existingBlock || normalizeCardIndentation(clearSetTags(savedMatch.block));
        if (isToken) {
            const existingTokenBlock = findExistingCard(xml, savedName);
            const hasSuffixedToken = cardBlocks(xml).some(block =>
                /^.+ \([^)]+\)$/.test(tagValue(block, 'name')) &&
                tagValue(block, 'name').startsWith(`${savedName} (`)
            );
            const newTokenName = hasSuffixedToken
                ? tokenNameWithSuffix(savedName, series.key)
                : savedName;
            if (existingTokenBlock) {
                const existingSet = (existingTokenBlock.match(/<set\b[^>]*>/i) || [])[0];
                const existingFlavor = existingSet && attribute(existingSet, 'flavorName');
                const oldTokenName = tokenNameWithSuffix(savedName, existingFlavor);
                const renameTarget = findExistingCard(xml, oldTokenName)
                    ? tokenNameWithSuffix(savedName, series.key)
                    : oldTokenName;
                if (findExistingCard(xml, renameTarget)) {
                    throw new Error(`Could not create a unique name for existing token "${savedName}".`);
                }
                const renamedBlock = renameCard(existingTokenBlock, renameTarget);
                workingXml = workingXml.replace(existingTokenBlock, renamedBlock);
            }
            if (findExistingCard(workingXml, newTokenName)) {
                throw new Error(`A token named "${newTokenName}" already exists.`);
            }
            existingBlock = null;
            sourceBlock = normalizeCardIndentation(clearReverseRelatedTags(clearSetTags(savedMatch.block)));
            sourceBlock = renameCard(sourceBlock, newTokenName);
        }
        const relatedCards = [];
        if (isToken) {
            const associationType = await chooseByNumber(rl, 'Do you want to associate one card or multiple cards? ', [
                { value: 'one', label: 'one card' },
                { value: 'multiple', label: 'multiple' }
            ]);
            if (associationType.value === 'one') {
                const relatedName = await ask(rl, 'Enter a card to reverse relate to the token: ');
                if (!relatedName) throw new Error('A card name is required for reverse relation.');
                const relatedBlock = findExistingCard(xml, relatedName);
                if (!relatedBlock) throw new Error(`Could not find card "${relatedName}" in lechugapod.xml.`);
                relatedCards.push({ block: relatedBlock, name: tagValue(relatedBlock, 'name') });
            } else {
                console.log('Enter card names to reverse relate them to the token. When you are done, leave your response blank and hit ENTER:');
                while (true) {
                    const relatedName = await ask(rl, '');
                    if (!relatedName) break;
                    const relatedBlock = findExistingCard(xml, relatedName);
                    if (!relatedBlock) throw new Error(`Could not find card "${relatedName}" in lechugapod.xml.`);
                    relatedCards.push({ block: relatedBlock, name: tagValue(relatedBlock, 'name') });
                }
                if (relatedCards.length === 0) throw new Error('At least one card name is required for reverse relation.');
            }
            for (const relatedCard of relatedCards) {
                sourceBlock = addReverseRelatedTag(sourceBlock, relatedCard.name);
            }
        }
        const layout = tagValue(sourceBlock, 'layout');
        let num = null;
        if (layout === 'modal_dfc') {
            num = await ask(rl, 'What is the num? ');
            if (!num) throw new Error('A num is required for modal DFC cards.');
        }

        const uuid = isToken ? nextTokenUuid(xml) : nextUuid(xml);
        const flavorAttribute = series.key ? ` flavorName="${series.key}"` : '';
        const numAttribute = num ? ` num="${encodeXml(num)}"` : '';
        const uuidValue = isToken
            ? `00000000-0000-0000-${uuid}-XXXXXXXXXXXX`
            : `00000000-0000-0000-0000-${uuid}`;
        const setTag = `            <set rarity="rare" uuid="${uuidValue}"${numAttribute}${flavorAttribute} picurl="${encodeXml(imageUrl(type.folder, actualImageName))}">CLM</set>`;
        const updatedBlock = addSetTag(sourceBlock, setTag);
        let updatedXml = existingBlock
            ? workingXml.replace(existingBlock, updatedBlock)
            : insertCard(workingXml, updatedBlock);

        fs.writeFileSync(XML_PATH, updatedXml, 'utf8');
        console.log(`${existingBlock ? 'Added artwork to' : 'Added'} ${savedName} with UUID ${uuid}.`);
    } finally {
        rl.close();
    }
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
