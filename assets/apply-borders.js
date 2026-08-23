const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SCRIPT_DIR = __dirname;
const MASK_PATH = path.join(SCRIPT_DIR, "borders.png");
const LOG_PATH = path.join(SCRIPT_DIR, "log.txt");

function findPngFiles(directory) {
    let results = [];

    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === "node_modules") {
                continue;
            }

            results = results.concat(findPngFiles(fullPath));
        } else if (
            directory !== SCRIPT_DIR &&
            entry.isFile() &&
            path.extname(entry.name).toLowerCase() === ".png"
        ) {
            results.push(fullPath);
        }
    }

    return results;
}

function loadLog() {
    if (!fs.existsSync(LOG_PATH)) {
        return new Set();
    }

    const lines = fs.readFileSync(LOG_PATH, "utf8")
        .split(/\r?\n/)
        .filter(line => line.trim() !== "");

    const processed = new Set();

    for (const line of lines) {
        const separator = line.indexOf(" | ");

        if (separator !== -1) {
            const filePath = line.substring(0, separator).trim();
            processed.add(filePath);
        }
    }

    return processed;
}

function getTimestamp() {
    const now = new Date();

    const pad = n => String(n).padStart(2, "0");

    return (
        `${now.getFullYear()}-` +
        `${pad(now.getMonth() + 1)}-` +
        `${pad(now.getDate())} ` +
        `${pad(now.getHours())}:` +
        `${pad(now.getMinutes())}:` +
        `${pad(now.getSeconds())}`
    );
}

async function processImage(imagePath, maskData, maskWidth, maskHeight) {
    const relativePath = path
        .relative(SCRIPT_DIR, imagePath)
        .replace(/\\/g, "/");

    console.log(`Processing: ${relativePath}`);

    const image = sharp(imagePath).ensureAlpha();

    const imageMetadata = await image.metadata();

    if (
        imageMetadata.width !== maskWidth ||
        imageMetadata.height !== maskHeight
    ) {
        throw new Error(
            `Size mismatch: image is ${imageMetadata.width}x${imageMetadata.height}, ` +
            `but borders.png is ${maskWidth}x${maskHeight}`
        );
    }

    const { data: imageData, info } = await image
        .raw()
        .toBuffer({ resolveWithObject: true });

    for (let i = 0; i < imageData.length; i += 4) {
        const maskIndex = i + 3;
        const imageAlpha = imageData[i + 3];
        const maskAlpha = maskData[maskIndex];

        imageData[i + 3] = Math.round(
            (imageAlpha * maskAlpha) / 255
        );
    }

    const output = await sharp(imageData, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 4
        }
    })
        .png()
        .toBuffer();

    fs.writeFileSync(imagePath, output);

    return relativePath;
}

async function main() {
    console.log("==============================");
    console.log(" Border Mask Processor");
    console.log("==============================\n");

    if (!fs.existsSync(MASK_PATH)) {
        console.error("ERROR: borders.png was not found.");
        console.error(`Expected location: ${MASK_PATH}`);
        process.exit(1);
    }

    const processedFiles = loadLog();

    console.log(`Previously processed: ${processedFiles.size}`);

    const pngFiles = findPngFiles(SCRIPT_DIR).filter(
        file => path.resolve(file) !== path.resolve(MASK_PATH)
    );

    console.log(`PNG files found: ${pngFiles.length}\n`);

    const maskImage = sharp(MASK_PATH).ensureAlpha();

    const maskMetadata = await maskImage.metadata();

    if (!maskMetadata.width || !maskMetadata.height) {
        console.error("ERROR: Could not determine borders.png dimensions.");
        process.exit(1);
    }

    const { data: maskData } = await maskImage
        .raw()
        .toBuffer({ resolveWithObject: true });

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const imagePath of pngFiles) {
        const relativePath = path
            .relative(SCRIPT_DIR, imagePath)
            .replace(/\\/g, "/");

        if (processedFiles.has(relativePath)) {
            console.log(`Skipping: ${relativePath}`);
            skippedCount++;
            continue;
        }

        try {
            const processedPath = await processImage(
                imagePath,
                maskData,
                maskMetadata.width,
                maskMetadata.height
            );

            const timestamp = getTimestamp();

            fs.appendFileSync(
                LOG_PATH,
                `${processedPath} | ${timestamp}\n`
            );

            processedFiles.add(relativePath);
            processedCount++;

            console.log(`  Done: ${processedPath}\n`);
        } catch (error) {
            errorCount++;

            console.error(
                `  ERROR processing ${relativePath}:`
            );
            console.error(`  ${error.message}\n`);
        }
    }

    console.log("======================================");
    console.log(" Finished");
    console.log("======================================");
    console.log(`Processed: ${processedCount}`);
    console.log(`Skipped:   ${skippedCount}`);
    console.log(`Errors:    ${errorCount}`);
    console.log("======================================");
}

main().catch(error => {
    console.error("\nFatal error:");
    console.error(error);
    process.exit(1);
});