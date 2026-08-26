'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const scripts = [
    'add_attributions.js',
    'apply-borders.js',
    'update_readme.js',
    'update_patchnotes.js'
];

for (const script of scripts) {
    const scriptPath = path.join(__dirname, script);
    console.log(`Running ${script}...`);

    const result = spawnSync(process.execPath, [scriptPath], {
        stdio: 'inherit'
    });

    if (result.error) {
        console.error(`Failed to start ${script}: ${result.error.message}`);
        process.exit(1);
    }

    if (result.status !== 0) {
        console.error(`${script} exited with code ${result.status}`);
        process.exit(result.status ?? 1);
    }
}
