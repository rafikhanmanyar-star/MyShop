#!/usr/bin/env node
/**
 * Runs `concurrently` for npm dev profiles and ensures dev ports are released on
 * Ctrl+C, SIGTERM, normal exit, or before the next start (cleans orphaned listeners).
 */
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { freeDevPorts } from './dev-ports.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const concurrentlyBin = join(root, 'node_modules', 'concurrently', 'dist', 'bin', 'concurrently.js');

const PROFILES = {
    dev: {
        names: 'api,client,website,mobile,rider',
        colors: 'blue,green,yellow,cyan,magenta',
        commands: [
            'npm run dev:server',
            'npm run dev:client',
            'npm run dev:website',
            'npm run dev:mobile',
            'npm run dev:rider',
        ],
    },
    apps: {
        names: 'api,website,mobile,rider',
        colors: 'blue,yellow,cyan,magenta',
        commands: [
            'npm run dev:server',
            'npm run dev:website',
            'npm run dev:mobile',
            'npm run dev:rider',
        ],
    },
    electron: {
        names: 'server,mobile,rider,electron',
        colors: 'blue,cyan,magenta,green',
        commands: [
            'npm run dev:server',
            'npm run dev:mobile',
            'npm run dev:rider',
            'wait-on http://localhost:3001/api/health && electron . --dev',
        ],
    },
};

const profileName = process.argv[2] || 'dev';
const profile = PROFILES[profileName];
if (!profile) {
    console.error(`Unknown dev profile "${profileName}". Use: dev | apps | electron`);
    process.exit(1);
}

let child = null;
let shuttingDown = false;

function killChildTree() {
    if (!child?.pid) return;
    try {
        if (process.platform === 'win32') {
            execSync(`taskkill /PID ${child.pid} /F /T`, { stdio: 'ignore' });
        } else {
            child.kill('SIGTERM');
        }
    } catch {
        /* already gone */
    }
}

function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    killChildTree();
    freeDevPorts();
    process.exit(code);
}

function start() {
    console.log('Clearing stale dev ports before start…');
    freeDevPorts();

    const args = [
        '--kill-others',
        '--kill-others-on-fail',
        '--handle-input',
        '-n',
        profile.names,
        '-c',
        profile.colors,
        ...profile.commands,
    ];

    // Run concurrently via node (no shell) so each "npm run …" stays one command on Windows.
    child = spawn(process.execPath, [concurrentlyBin, ...args], {
        cwd: root,
        stdio: 'inherit',
        shell: false,
        windowsHide: false,
        env: { ...process.env, FORCE_COLOR: '1' },
    });

    child.on('error', (err) => {
        console.error('Failed to start dev processes:', err.message);
        shutdown(1);
    });

    child.on('exit', (code, signal) => {
        child = null;
        if (shuttingDown) return;
        console.log('\nStopping dev servers and freeing ports…');
        freeDevPorts();
        const exitCode = signal ? 1 : code ?? 0;
        process.exit(exitCode);
    });
}

process.on('SIGINT', () => {
    console.log('\nReceived Ctrl+C — stopping all dev servers…');
    shutdown(130);
});

process.on('SIGTERM', () => shutdown(0));

process.on('exit', () => {
    if (!shuttingDown) freeDevPorts();
});

start();
