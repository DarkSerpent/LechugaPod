const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SCRIPT_DIR = __dirname;
const MASK_PATH = path.join(SCRIPT_DIR, "borders.png");
const LOG_PATH = path.join(SCRIPT_DIR, "log.txt");

function findPngFiles(directory, includeFiles = false) {
    let results = [];

    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === "node_modules") {
                continue;
            }

            results = results.concat(findPngFiles(fullPath, true));
        } else if (
            includeFiles &&
            entry.isFile() &&
            path.extname(entry.name).toLowerCase() === ".png"
        ) {
            results.push(fullPath);
        }
    }

    return results;
}

function loadLog() {
    const processed = new Map();

    if (!fs.existsSync(LOG_PATH)) {
        return processed;
    }

    const lines = fs.readFileSync(LOG_PATH, "utf8")
        .split(/\r?\n/)
        .filter(line => line.trim() !== "");

    for (const line of lines) {
        const separator = line.lastIndexOf(" | ");

        if (separator === -1) {
            continue;
        }

        const filePath = line.substring(0, separator).trim();
        const timestamp = line.substring(separator + 3).trim();
        const modifiedTime = Number(timestamp);

        if (
            filePath &&
            Number.isFinite(modifiedTime)
        ) {
            processed.set(filePath, modifiedTime);
        }
    }

    return processed;
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    const pad = n => String(n).padStart(2, "0");

    return (
        `${date.getFullYear()}-` +
        `${pad(date.getMonth() + 1)}-` +
        `${pad(date.getDate())} ` +
        `${pad(date.getHours())}:` +
        `${pad(date.getMinutes())}:` +
        `${pad(date.getSeconds())}.` +
        `${String(date.getMilliseconds()).padStart(3, "0")}`
    );
}

async function processImage(imagePath, maskData, maskWidth, maskHeight) {
    const relativePath = path
        .relative(SCRIPT_DIR, imagePath)
        .replace(/\\/g, "/");

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
        const imageAlpha = imageData[i + 3];
        const maskAlpha = maskData[i + 3];

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

    console.log(`Logged files: ${processedFiles.size}`);

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
    let updatedCount = 0;
    let newCount = 0;
    let errorCount = 0;

    for (const imagePath of pngFiles) {
        const relativePath = path
            .relative(SCRIPT_DIR, imagePath)
            .replace(/\\/g, "/");

        const imageStats = fs.statSync(imagePath);
        const imageModifiedTime = imageStats.mtimeMs;
        const loggedModifiedTime = processedFiles.get(relativePath);

        console.log(`Checking: ${relativePath}`);

        if (loggedModifiedTime !== undefined) {
            if (imageModifiedTime <= loggedModifiedTime) {
                console.log(
                    `  Skipping - unchanged`
                );
                console.log(
                    `  Image: ${imageModifiedTime}`
                );
                console.log(
                    `  Log:   ${loggedModifiedTime}\n`
                );

                skippedCount++;
                continue;
            }

            console.log(
                `  Image was modified after it was last processed`
            );

            updatedCount++;
        } else {
            console.log(
                `  New image - processing`
            );

            newCount++;
        }

        try {
            const processedPath = await processImage(
                imagePath,
                maskData,
                maskMetadata.width,
                maskMetadata.height
            );

            const newImageStats = fs.statSync(imagePath);
            const newModifiedTime = newImageStats.mtimeMs;

            processedFiles.set(
                relativePath,
                newModifiedTime
            );

            processedCount++;

            console.log(
                `  Processed: ${processedPath}`
            );
            console.log(
                `  New timestamp: ${newModifiedTime}\n`
            );
        } catch (error) {
            errorCount++;

            console.error(
                `  ERROR processing ${relativePath}:`
            );
            console.error(`  ${error.message}\n`);
        }
    }

    const logLines = [];

    for (const [filePath, timestamp] of processedFiles) {
        logLines.push(
            `${filePath} | ${timestamp}`
        );
    }

    fs.writeFileSync(
        LOG_PATH,
        logLines.length > 0
            ? logLines.join("\n") + "\n"
            : ""
    );

    console.log("======================================");
    console.log(" Finished");
    console.log("======================================");
    console.log(`New:       ${newCount}`);
    console.log(`Updated:   ${updatedCount}`);
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