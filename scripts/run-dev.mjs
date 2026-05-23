#!/usr/bin/env node
/**
 * Runs local dev servers via `concurrently` with direct Node spawns (no cmd.exe / npm
 * wrappers on Windows) so Ctrl+C, terminal close, and port cleanup reliably stop all children.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { freeDevPorts } from './dev-ports.mjs';
import { killOrphanedDevProcesses, killProcessTree } from './dev-process-utils.mjs';

const require = createRequire(import.meta.url);
const {
    concurrently: runConcurrently,
    Logger,
    LogError,
    LogOutput,
    LogExit,
    InputHandler,
    KillOnSignal,
    KillOthers,
} = require('concurrently');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Direct node entry points — avoids `npm run` → cmd.exe → orphaned trees on Windows. */
const DEV_SERVICES = {
    api: {
        cwd: 'server',
        script: 'node_modules/tsx/dist/cli.mjs',
        args: ['watch', 'api/index.ts'],
    },
    client: {
        cwd: 'client',
        script: 'node_modules/vite/bin/vite.js',
        args: [],
    },
    website: {
        cwd: 'website',
        script: 'node_modules/next/dist/bin/next',
        args: ['dev', '--turbopack', '-p', '5190'],
    },
    mobile: {
        cwd: 'mobile',
        script: 'node_modules/vite/bin/vite.js',
        args: [],
    },
    rider: {
        cwd: 'rider',
        script: 'node_modules/vite/bin/vite.js',
        args: [],
    },
    electron: {
        cwd: '.',
        script: 'scripts/wait-and-electron.mjs',
        args: [],
    },
};

const PROFILES = {
    dev: [
        { name: 'api', command: 'api', prefixColor: 'blue' },
        { name: 'client', command: 'client', prefixColor: 'green' },
        { name: 'website', command: 'website', prefixColor: 'yellow' },
        { name: 'mobile', command: 'mobile', prefixColor: 'cyan' },
        { name: 'rider', command: 'rider', prefixColor: 'magenta' },
    ],
    apps: [
        { name: 'api', command: 'api', prefixColor: 'blue' },
        { name: 'website', command: 'website', prefixColor: 'yellow' },
        { name: 'mobile', command: 'mobile', prefixColor: 'cyan' },
        { name: 'rider', command: 'rider', prefixColor: 'magenta' },
    ],
    electron: [
        { name: 'server', command: 'api', prefixColor: 'blue' },
        { name: 'mobile', command: 'mobile', prefixColor: 'cyan' },
        { name: 'rider', command: 'rider', prefixColor: 'magenta' },
        { name: 'electron', command: 'electron', prefixColor: 'green' },
    ],
};

const profileName = process.argv[2] || 'dev';
const profileCommands = PROFILES[profileName];
if (!profileCommands) {
    console.error(`Unknown dev profile "${profileName}". Use: dev | apps | electron`);
    process.exit(1);
}

let activeCommands = [];
const trackedPids = new Set();
let shuttingDown = false;

function trackChild(child) {
    if (child?.pid) trackedPids.add(child.pid);
    child?.on('exit', () => {
        if (child?.pid) trackedPids.delete(child.pid);
    });
    return child;
}

/** Spawn dev tools with node.exe directly — never cmd.exe / npm.cmd. */
function spawnDevService(command, options) {
    const svc = DEV_SERVICES[command];
    if (!svc) {
        throw new Error(`Unknown dev service id "${command}"`);
    }
    const cwd = join(root, svc.cwd);
    const scriptPath = join(cwd, svc.script);
    const child = spawn(process.execPath, [scriptPath, ...svc.args], {
        cwd,
        stdio: options.raw ? 'inherit' : 'pipe',
        env: { ...process.env, ...options.env, FORCE_COLOR: '1' },
        windowsHide: false,
        detached: false,
    });
    return trackChild(child);
}

function stopAllDevProcesses() {
    for (const cmd of activeCommands) {
        try {
            cmd.kill('SIGTERM');
        } catch {
            /* already stopped */
        }
    }
    for (const pid of [...trackedPids]) {
        killProcessTree(pid);
    }
    trackedPids.clear();
}

function cleanupDevEnvironment() {
    stopAllDevProcesses();
    freeDevPorts();
    killOrphanedDevProcesses(root);
}

function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    cleanupDevEnvironment();
    process.exit(code);
}

function start() {
    console.log('Clearing stale dev ports and orphaned Node processes before start…');
    freeDevPorts();
    killOrphanedDevProcesses(root);

    const logger = new Logger({
        prefixFormat: '{name}',
        prefixLength: 10,
    });

    const { result, commands } = runConcurrently(profileCommands, {
        cwd: root,
        spawn: spawnDevService,
        logger,
        outputStream: process.stdout,
        prefixColors: profileCommands.map((c) => c.prefixColor),
        controllers: [
            new LogError({ logger }),
            new LogOutput({ logger }),
            new LogExit({ logger }),
            new InputHandler({
                logger,
                inputStream: process.stdin,
                defaultInputTarget: 0,
            }),
            new KillOnSignal({ process }),
            new KillOthers({ logger, conditions: ['success', 'failure'] }),
        ],
    });

    activeCommands = commands;

    result.catch((err) => {
        if (!shuttingDown) {
            console.error('Dev runner error:', err?.message ?? err);
            shutdown(1);
        }
    });

    result.then(
        () => {
            if (shuttingDown) return;
            console.log('\nStopping dev servers and freeing ports…');
            cleanupDevEnvironment();
            process.exit(0);
        },
        () => {
            if (shuttingDown) return;
            cleanupDevEnvironment();
            process.exit(1);
        },
    );
}

process.on('SIGINT', () => {
    console.log('\nReceived Ctrl+C — stopping all dev servers…');
    shutdown(130);
});

process.on('SIGTERM', () => shutdown(0));

if (process.platform === 'win32') {
    process.on('SIGBREAK', () => shutdown(0));
}

process.on('exit', () => {
    if (!shuttingDown) {
        freeDevPorts();
        killOrphanedDevProcesses(root);
    }
});

start();
