import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const execFileAsync = promisify(execFile);
// `_to_delete` est le tampon des fichiers en attente de retrait manuel : il
// contient d'anciens bundles minifiés. Les analyser gonflait le compte de
// fichiers (131 au lieu de 108) et validait du code qui n'existe plus.
const ignoredDirectories = new Set(['node_modules', 'dist', '.git', '_to_delete', 'coverage', '.vite']);

async function collectJavaScriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (ignoredDirectories.has(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectJavaScriptFiles(path));
        else if (entry.isFile() && /\.m?js$/.test(entry.name)) files.push(path);
    }

    return files;
}

const files = await collectJavaScriptFiles(process.cwd());
const failures = [];

for (const file of files) {
    try {
        await execFileAsync(process.execPath, ['--check', file]);
    } catch (error) {
        failures.push({ file: relative(process.cwd(), file), message: error.stderr || error.message });
    }
}

if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`Syntax error in ${failure.file}\n${failure.message}`);
    }
    process.exitCode = 1;
} else {
    console.log(`Syntax check passed for ${files.length} JavaScript files.`);
}
