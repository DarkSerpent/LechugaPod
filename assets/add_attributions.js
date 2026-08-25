const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createCanvas, loadImage, registerFont } = require('canvas');

const fontsDir = path.join(__dirname, 'fonts');
const belerenPath = path.join(fontsDir, 'BelerenSmallCaps.ttf');
const conneqtPath = path.join(fontsDir, 'ConneqtRegular.ttf');

if (!fs.existsSync(belerenPath) || !fs.existsSync(conneqtPath)) {
  console.error(
    'Required fonts not found in assets/fonts. Install BelerenSmallCaps.ttf and ConneqtRegular.ttf'
  );
  process.exit(1);
}

try {
  registerFont(belerenPath, { family: 'BelerenSmallCaps' });
  registerFont(conneqtPath, { family: 'ConneqtRegular' });
} catch (err) {
  console.error(
    'Failed to register fonts. Is node-canvas properly installed?',
    err.message
  );
  process.exit(1);
}

const ASSETS_DIR = __dirname;
const XML_PATH = path.join(__dirname, '..', 'lechugapod.xml');
const ARTISTS_FILE = path.join(__dirname, 'artists.md');

const CANVAS_W = 2010;
const CANVAS_H = 2814;

const recentArtists = [];

const pendingTemps = new Set();

function cleanupPendingTemps() {
  if (!pendingTemps.size) return;

  try {
    console.log('\nCleanup: removing pending temp files...');
  } catch (e) {}

  for (const p of Array.from(pendingTemps)) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch (e) {
      try {
        console.warn(
          'Failed to remove temp during cleanup:',
          p,
          e.message
        );
      } catch (_) {}
    }

    try {
      pendingTemps.delete(p);
    } catch (_) {}
  }
}

process.on('SIGINT', () => {
  cleanupPendingTemps();
  process.exit(130);
});

process.on('SIGTERM', () => {
  cleanupPendingTemps();
  process.exit(143);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanupPendingTemps();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  cleanupPendingTemps();
  process.exit(1);
});

process.on('exit', () => {
  cleanupPendingTemps();
});

function findSubfoldersWithPngs() {
  const children = fs.readdirSync(ASSETS_DIR, {
    withFileTypes: true
  });

  const dirs = children
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: 'base'
      })
    );

  const result = [];

  for (const d of dirs) {
    const dirPath = path.join(ASSETS_DIR, d);

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => /\.png$/i.test(f));

    if (files.length) {
      result.push({
        name: d,
        files: files.sort((a, b) =>
          a.localeCompare(b, undefined, {
            sensitivity: 'base'
          })
        )
      });
    }
  }

  return result;
}

function groupAndOrderFiles(files) {
  const variantGroups = new Map();
  const singles = [];

  for (const f of files) {
    const base = path.basename(f, '.png');
    const m = base.match(/^(.*) \(([^)]+)\)$/);

    if (m) {
      const name = m[1].trim();
      const variant = m[2].trim();

      if (!variantGroups.has(variant)) {
        variantGroups.set(variant, []);
      }

      variantGroups.get(variant).push({
        file: f,
        name
      });
    } else {
      singles.push({
        file: f,
        name: base
      });
    }
  }

  for (const [k, arr] of variantGroups) {
    arr.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base'
      })
    );
  }

  const variantKeys = Array.from(
    variantGroups.keys()
  ).sort((a, b) =>
    a.localeCompare(b, undefined, {
      sensitivity: 'base'
    })
  );

  const result = [];

  for (const vk of variantKeys) {
    for (const entry of variantGroups.get(vk)) {
      result.push(entry.file);
    }
  }

  singles.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: 'base'
    })
  );

  for (const s of singles) {
    result.push(s.file);
  }

  return result;
}

function readArtistsLog() {
  const map = new Map();

  if (!fs.existsSync(ARTISTS_FILE)) {
    return map;
  }

  const text = fs.readFileSync(
    ARTISTS_FILE,
    'utf8'
  );

  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const m = line.match(
      /^\s*(?:[-*]\s*)?(\S.*)\s*\|\s*(.+)\s*$/
    );

    if (m) {
      const rel = m[1].trim();

      let artistRaw = m[2].trim();

      artistRaw = artistRaw
        .replace(/\[\^1\]\s*$/, '')
        .trim();

      const linkMatch = artistRaw.match(
        /^\[(.+)\]\((https?:\/\/[^)]+)\)$/
      );

      if (linkMatch) {
        map.set(rel, {
          name: linkMatch[1].trim(),
          url: linkMatch[2].trim()
        });
      } else {
        map.set(rel, {
          name: artistRaw,
          url: null
        });
      }
    }
  }

  return map;
}

function isHttpUrl(u) {
  return !!(u && typeof u === 'string' && /^https?:\/\//i.test(u));
}

function saveArtistsLog(map) {
  const folders =
    findSubfoldersWithPngs();

  const folderNames =
    folders.map(
      (f) => f.name
    );

  const ordered = [];

  if (
    folderNames.includes(
      'cards'
    )
  ) {
    ordered.push(
      'cards'
    );
  }

  if (
    folderNames.includes(
      'planeswalkers'
    )
  ) {
    ordered.push(
      'planeswalkers'
    );
  }

  const others =
    folderNames
      .filter(
        (n) =>
          n !== 'cards' &&
          n !== 'planeswalkers'
      )
      .sort((a, b) =>
        a.localeCompare(
          b,
          undefined,
          {
            sensitivity: 'base'
          }
        )
      );

  ordered.push(
    ...others
  );

  const out = [];

  for (
    const folder of ordered
  ) {
    const prefix =
      folder + '/';

    const entries = [];

    for (
      const [rel, artist] of map
    ) {
      if (
        rel.startsWith(
          prefix
        )
      ) {
        entries.push({
          rel,
          artist,
          file: rel.slice(
            prefix.length
          )
        });
      }
    }

    if (!entries.length) {
      continue;
    }

    let displayName =
      folder;

    if (
      folder === 'cards'
    ) {
      displayName =
        'Creature Cards';
    } else if (
      folder === 'planeswalkers'
    ) {
      displayName =
        'Planeswalkers';
    } else {
      displayName =
        folder.charAt(0).toUpperCase() +
        folder.slice(1);
    }

    out.push(
      `## ${displayName}`
    );

    if (
      folder === 'cards'
    ) {
      entries.sort(
        (a, b) =>
          a.file.localeCompare(
            b.file,
            undefined,
            {
              sensitivity: 'base'
            }
          )
      );

      for (
        const e of entries
      ) {
        let artistObj =
          map.get(e.rel) ||
          (
            typeof e.artist === 'string'
              ? {
                  name: e.artist,
                  url: null
                }
              : (
                  e.artist || {
                    name: '',
                    url: null
                  }
                )
          );

        if (
          artistObj &&
          artistObj.name
        ) {
          artistObj.name =
            String(
              artistObj.name
            )
              .replace(
                /\[\^1\]\s*$/,
                ''
              )
              .trim();
        }

        if (
          artistObj &&
          isHttpUrl(
            artistObj.url
          )
        ) {
          out.push(
            `* ${e.rel} | [${artistObj.name}](${artistObj.url})`
          );
        } else {
          out.push(
            `* ${e.rel} | ${artistObj.name}[^1]`
          );
        }
      }
    } else {
      const groups =
        new Map();

      const unsorted = [];

      for (
        const e of entries
      ) {
        const base =
          path.basename(
            e.file,
            '.png'
          );

        const m =
          base.match(
            /^(.*) \(([^)]+)\)$/
          );

        if (m) {
          const variant =
            m[2].trim();

          if (
            !groups.has(
              variant
            )
          ) {
            groups.set(
              variant,
              []
            );
          }

          groups
            .get(variant)
            .push(e);
        } else {
          unsorted.push(e);
        }
      }

      const variantKeys =
        Array.from(
          groups.keys()
        ).sort((a, b) =>
          a.localeCompare(
            b,
            undefined,
            {
              sensitivity: 'base'
            }
          )
        );

      for (
        const vk of variantKeys
      ) {
        out.push(
          `### ${vk}`
        );

        const arr =
          groups
            .get(vk)
            .sort((a, b) =>
              a.file.localeCompare(
                b.file,
                undefined,
                {
                  sensitivity: 'base'
                }
              )
            );

        for (
          const e of arr
        ) {
          let artistObj =
            map.get(e.rel) ||
            (
              typeof e.artist === 'string'
                ? {
                    name: e.artist,
                    url: null
                  }
                : (
                    e.artist || {
                      name: '',
                      url: null
                    }
                  )
            );

          if (
            artistObj &&
            artistObj.name
          ) {
            artistObj.name =
              String(
                artistObj.name
              )
                .replace(
                  /\[\^1\]\s*$/,
                  ''
                )
                .trim();
          }

          if (
            artistObj &&
            isHttpUrl(
              artistObj.url
            )
          ) {
            out.push(
              `* ${e.rel} | [${artistObj.name}](${artistObj.url})`
            );
          } else {
            out.push(
              `* ${e.rel} | ${artistObj.name}[^1]`
            );
          }
        }
      }

      if (
        unsorted.length
      ) {
        out.push(
          '### Unsorted'
        );

        unsorted.sort(
          (a, b) =>
            a.file.localeCompare(
              b.file,
              undefined,
              {
                sensitivity: 'base'
              }
            )
        );

        for (
          const e of unsorted
        ) {
          let artistObj =
            map.get(e.rel) ||
            (
              typeof e.artist === 'string'
                ? {
                    name: e.artist,
                    url: null
                  }
                : (
                    e.artist || {
                      name: '',
                      url: null
                    }
                  )
            );

          if (
            artistObj &&
            artistObj.name
          ) {
            artistObj.name =
              String(
                artistObj.name
              )
                .replace(
                  /\[\^1\]\s*$/,
                  ''
                )
                .trim();
          }

          if (
            artistObj &&
            isHttpUrl(
              artistObj.url
            )
          ) {
            out.push(
              `* ${e.rel} | [${artistObj.name}](${artistObj.url})`
            );
          } else {
            out.push(
              `* ${e.rel} | ${artistObj.name}[^1]`
            );
          }
        }
      }
    }

    out.push('');
  }

  const footnote =
    `[^1]: No publicly available or accessible documentation of this artist was found.`;

  if (
    out.length === 0 ||
    out[out.length - 1] !== ''
  ) {
    out.push('');
  }

  out.push(
    footnote
  );

  fs.writeFileSync(
    ARTISTS_FILE,
    out.join('\n') + '\n',
    'utf8'
  );
}

function findUuidForFilename(
  xmlText,
  filename
) {
  const encoded =
    encodeURIComponent(
      filename
    );

  const idx =
    xmlText.indexOf(
      encoded
    );

  if (idx === -1) {
    return null;
  }

  const before =
    xmlText.lastIndexOf(
      '<set',
      idx
    );

  if (before === -1) {
    return null;
  }

  const tagEnd =
    xmlText.indexOf(
      '>',
      before
    );

  const tag =
    xmlText.substring(
      before,
      tagEnd === -1
        ? before + 300
        : tagEnd
    );

  const m =
    tag.match(
      /uuid="([^"]+)"/i
    );

  return m
    ? m[1]
    : null;
}

function findExistingFile(
  dir,
  targetName
) {
  try {
    const files =
      fs.readdirSync(
        dir
      );

    const normTarget =
      normalizeForMatch(
        targetName
      );

    for (
      const f of files
    ) {
      if (
        normalizeForMatch(
          f
        ) === normTarget
      ) {
        return f;
      }
    }

    for (
      const f of files
    ) {
      if (
        normalizeForMatch(
          decodeURIComponent(f)
        ) === normTarget
      ) {
        return f;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

function normalizeForMatch(s) {
  if (!s) {
    return s;
  }

  return s
    .normalize('NFC')
    .replace(
      /[\u2018\u2019\u201A\u201B\u2032\u2035]/g,
      "'"
    )
    .replace(
      /[\u201C\u201D\u201E\u201F]/g,
      '"'
    )
    .replace(
      /[\u2013\u2014]/g,
      '-'
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toLowerCase();
}

async function processCard(
  folderName,
  fileName,
  xmlText,
  artistsMap,
  currentIndex,
  totalCards
) {
  const relPath =
    path
      .join(
        folderName,
        fileName
      )
      .replace(
        /\\/g,
        '/'
      );

  if (
    artistsMap.has(
      relPath
    )
  ) {
    console.log(
      `Skipping already-logged: ${relPath}`
    );

    return artistsMap;
  }

  const uuid =
    findUuidForFilename(
      xmlText,
      fileName
    );

  const code =
    uuid
      ? uuid.slice(-4)
      : '0000';

  const canvas =
    createCanvas(
      CANVAS_W,
      CANVAS_H
    );

  const ctx =
    canvas.getContext(
      '2d'
    );

  const startX = 130;

  let y = 2672;

  ctx.fillStyle =
    '#FFFFFF';

  ctx.font =
    '50px "ConneqtRegular"';

  ctx.fillText(
    `LP ${code} Proxy`,
    startX,
    y
  );

  const lineHeight = 60;

  y += lineHeight;

  ctx.fillText(
    'CLM • EN',
    startX,
    y
  );

  const spacesWidth =
    ctx.measureText(
      '     '
    ).width;

  const afterX =
    startX +
    ctx.measureText(
      'CLM • EN'
    ).width +
    spacesWidth +
    13;

  const baseName =
    path.basename(
      fileName,
      '.png'
    );

  const tempName =
    `${baseName} - Temp.png`;

  const folderPath =
    path.join(
      ASSETS_DIR,
      folderName
    );

  const tempPath =
    path.join(
      folderPath,
      tempName
    );

  try {
    if (
      fs.existsSync(
        tempPath
      )
    ) {
      fs.unlinkSync(
        tempPath
      );
    }
  } catch (e) {
    console.warn(
      'Could not remove existing temp file before creating new one:',
      tempPath,
      e.message
    );
  }

  fs.writeFileSync(
    tempPath,
    canvas.toBuffer(
      'image/png'
    )
  );

  pendingTemps.add(
    tempPath
  );

  const instrColor =
    '\x1b[38;2;136;231;184m';

  const nameColor =
    '\x1b[38;2;136;231;136m';

  const reset =
    '\x1b[0m';

  console.log(
    `${instrColor}(${currentIndex}/${totalCards}) What is the artist attributed to the card...${reset}`
  );

  console.log(
    `${nameColor}${baseName}${reset}`
  );

  process.stdout.write(
    'Type your response below: '
  );

  const artist =
    await new Promise(
      (resolve) => {
        const rl =
          readline.createInterface({
            input:
              process.stdin,
            output:
              process.stdout
          });

        try {
          rl.history =
            recentArtists.slice();
        } catch (e) {}

        rl.question(
          '',
          (ans) => {
            rl.close();

            const val =
              ans.trim();

            if (val) {
              const idx =
                recentArtists.indexOf(
                  val
                );

              if (
                idx !== -1
              ) {
                recentArtists.splice(
                  idx,
                  1
                );
              }

              recentArtists.unshift(
                val
              );

              if (
                recentArtists.length >
                200
              ) {
                recentArtists.length =
                  200;
              }
            }

            resolve(val);
          }
        );
      }
    );

  const displayName =
    (artist || '')
      .replace(
        /[\s\u00A0]+$/,
        ''
      )
      .replace(
        /[\.,;:\u3002\uff0e]+$/,
        ''
      )
      .trim();

  let resolvedUrl = null;
  
  const existingMap = readArtistsLog();
  const artistName = displayName || artist;
  let existingUrl = null;
  
  for (const [, value] of existingMap) {
    if (value && value.name && normalizeForMatch(value.name) === normalizeForMatch(artistName) && isHttpUrl(value.url)) {
      existingUrl = value.url;
      break;
    }
  }
  
  if (existingUrl) {
    resolvedUrl = existingUrl;
    console.log(`\n${instrColor}Using previously defined URL for "${artistName}": ${existingUrl}${reset}\n`);
  } else {
    console.log(
      `\n${instrColor}Enter the URL of the artist or press ENTER to skip.${reset}`
    );
  
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  
    const answer = await new Promise((resolve) => {
      rl.question('URL: ', resolve);
    });
  
    rl.close();
  
    if (answer.trim() && isHttpUrl(answer.trim())) {
      resolvedUrl = answer.trim();
      console.log(`Using manually entered URL: ${resolvedUrl}\n`);
    }
  }

  artistsMap.set(
    relPath,
    {
      name:
        displayName ||
        artist,
      url:
        resolvedUrl
    }
  );

  saveArtistsLog(
    artistsMap
  );

  const imgBuffer =
    fs.readFileSync(
      tempPath
    );

  const overlay =
    await loadImage(
      imgBuffer
    );

  const mergedCanvas =
    createCanvas(
      CANVAS_W,
      CANVAS_H
    );

  const mctx =
    mergedCanvas.getContext(
      '2d'
    );

  mctx.drawImage(
    overlay,
    0,
    0
  );

  mctx.font =
    '50px "BelerenSmallCaps"';

  mctx.fillStyle =
    '#FFFFFF';

  mctx.fillText(
    displayName ||
      artist,
    afterX,
    y
  );

  fs.writeFileSync(
    tempPath,
    mergedCanvas.toBuffer(
      'image/png'
    )
  );

  pendingTemps.add(
    tempPath
  );

  const basePath =
    path.join(
      folderPath,
      fileName
    );

  let actualBasePath =
    basePath;

  if (
    !fs.existsSync(
      actualBasePath
    )
  ) {
    const alt =
      findExistingFile(
        folderPath,
        fileName
      );

    if (alt) {
      actualBasePath =
        path.join(
          folderPath,
          alt
        );

      console.log(
        'Using alternate matched filename for merge:',
        alt
      );
    }
  }

  if (
    fs.existsSync(
      actualBasePath
    )
  ) {
    const baseBuf =
      fs.readFileSync(
        actualBasePath
      );

    const baseImg =
      await loadImage(
        baseBuf
      );

    const outCanvas =
      createCanvas(
        CANVAS_W,
        CANVAS_H
      );

    const outCtx =
      outCanvas.getContext(
        '2d'
      );

    outCtx.drawImage(
      baseImg,
      0,
      0
    );

    const removeOverlayPath =
      path.join(
        ASSETS_DIR,
        'remove_attributions.png'
      );

    if (
      fs.existsSync(
        removeOverlayPath
      )
    ) {
      try {
        const remBuf =
          fs.readFileSync(
            removeOverlayPath
          );

        const remImg =
          await loadImage(
            remBuf
          );

        outCtx.drawImage(
          remImg,
          0,
          0,
          CANVAS_W,
          CANVAS_H
        );
      } catch (e) {
        console.warn(
          'Failed to apply remove_attributions overlay:',
          e.message
        );
      }
    }

    const overlayBuf =
      fs.readFileSync(
        tempPath
      );

    const overlayImg =
      await loadImage(
        overlayBuf
      );

    outCtx.drawImage(
      overlayImg,
      0,
      0
    );

    fs.writeFileSync(
      actualBasePath,
      outCanvas.toBuffer(
        'image/png'
      )
    );

    try {
      if (
        fs.existsSync(
          tempPath
        )
      ) {
        fs.unlinkSync(
          tempPath
        );
      }

      pendingTemps.delete(
        tempPath
      );
    } catch (e) {
      console.warn(
        'Failed to delete temp file:',
        tempPath,
        e.message
      );
    }
  } else {
    console.warn(
      'Base image not found to merge:',
      basePath
    );

    try {
      if (
        fs.existsSync(
          tempPath
        )
      ) {
        fs.unlinkSync(
          tempPath
        );
      }

      pendingTemps.delete(
        tempPath
      );
    } catch (e) {}
  }

  return artistsMap;
}

async function main() {
  if (
    !fs.existsSync(
      XML_PATH
    )
  ) {
    console.error(
      'lechugapod.xml not found at',
      XML_PATH
    );

    process.exit(1);
  }

  const xmlText =
    fs.readFileSync(
      XML_PATH,
      'utf8'
    );

  const folders =
    findSubfoldersWithPngs();

  if (!folders.length) {
    console.log(
      'No subfolders with PNGs found inside assets.'
    );

    return;
  }

  let artistsMap =
    readArtistsLog();

  const queue = [];

  for (
    const grp of folders
  ) {
    const orderedFiles =
      groupAndOrderFiles(
        grp.files
      );

    for (
      const file of orderedFiles
    ) {
      const relPath =
        path
          .join(
            grp.name,
            file
          )
          .replace(
            /\\/g,
            '/'
          );

      if (
        !artistsMap.has(
          relPath
        )
      ) {
        queue.push({
          folderName: grp.name,
          fileName: file
        });
      }
    }
  }

  for (
    let i = 0;
    i < queue.length;
    i++
  ) {
    const item =
      queue[i];

    artistsMap =
      await processCard(
        item.folderName,
        item.fileName,
        xmlText,
        artistsMap,
        i + 1,
        queue.length
      );
  }

  console.log(
    'All done.'
  );
}

main().catch(
  (err) => {
    console.error(err);
    process.exit(1);
  }
);