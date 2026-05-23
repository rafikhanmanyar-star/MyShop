#!/usr/bin/env node
/**
 * Waits for the local API health endpoint, then launches Electron in dev mode.
 * Invoked directly by node (no cmd.exe) from scripts/run-dev.mjs.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const waitOn = require('wait-on');

await waitOn({
    resources: ['http://localhost:3001/api/health'],
    timeout: 120000,
    interval: 500,
});

const electronCli = join(root, 'node_modules', 'electron', 'cli.js');
const child = spawn(process.execPath, [electronCli, '.', '--dev'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
    detached: false,
});

child.on('exit', (code, signal) => {
    process.exit(signal ? 1 : code ?? 0);
});

child.on('error', (err) => {
    console.error('Failed to start Electron:', err.message);
    process.exit(1);
});
