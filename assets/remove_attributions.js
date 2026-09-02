const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const scriptDir = __dirname;
const overlayPath = path.join(scriptDir, "remove_attributions.png");
const IGNORED_DIRECTORIES = new Set(["setsymbols", "customs"]);

const green = "\x1b[38;2;136;231;184m";
const lightGreen = "\x1b[38;2;136;231;136m";
const reset = "\x1b[0m";

function findPngs(dir, isRoot = true) {
    const results = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(entry.name)) continue;
            results.push(...findPngs(fullPath, false));
        } else if (
            !isRoot &&
            entry.isFile() &&
            path.extname(entry.name).toLowerCase() === ".png"
        ) {
            results.push(fullPath);
        }
    }

    return results;
}

async function main() {
    if (!fs.existsSync(overlayPath)) {
        console.error(`ERROR: Could not find "${overlayPath}"`);
        process.exit(1);
    }

    const pngFiles = findPngs(scriptDir);
    const total = pngFiles.length;

    console.log(`Found ${total} PNG(s) in subfolders.`);

    for (let i = 0; i < total; i++) {
        const imagePath = pngFiles[i];

        try {
            const metadata = await sharp(imagePath).metadata();

            const overlay = await sharp(overlayPath)
                .resize(metadata.width, metadata.height, {
                    fit: "fill"
                })
                .png()
                .toBuffer();

            const tempPath = imagePath + ".tmp.png";

            await sharp(imagePath)
                .composite([
                    {
                        input: overlay,
                        left: 0,
                        top: 0
                    }
                ])
                .png()
                .toFile(tempPath);

            fs.renameSync(tempPath, imagePath);

            const relativePath = path.relative(scriptDir, imagePath);

            console.log(
                `${green}Processed:${reset} ${relativePath} ${lightGreen}(${i + 1}/${total})${reset}`
            );
        } catch (error) {
            console.error(`FAILED: ${imagePath}`);
            console.error(error.message);
        }
    }

    console.log("Done.");
}

main();