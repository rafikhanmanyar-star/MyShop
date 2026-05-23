/**
 * Default local dev server ports (see Cursor/COMMANDS.md).
 * Used to free listeners when dev stops or before a new dev session starts.
 */
export const DEV_PORTS = [3001, 5173, 5175, 5180, 5190];

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { killOrphanedDevProcesses } from './dev-process-utils.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function killPidsWindows(pids) {
    for (const pid of pids) {
        if (!pid || pid === '0') continue;
        try {
            execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
        } catch {
            /* already gone */
        }
    }
}

function freePortWindows(port) {
    try {
        const out = execSync(`netstat -ano | findstr ":${port}" | findstr LISTENING`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const pids = new Set();
        for (const line of out.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            const pid = parts[parts.length - 1];
            if (/^\d+$/.test(pid)) pids.add(pid);
        }
        killPidsWindows(pids);
    } catch {
        /* nothing listening */
    }
}

function freePortUnix(port) {
    try {
        execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, {
            stdio: 'ignore',
            shell: true,
        });
    } catch {
        /* nothing listening */
    }
}

/** Kill any process listening on MyShop dev ports. Safe to call repeatedly. */
export function freeDevPorts(ports = DEV_PORTS) {
    const isWin = platform() === 'win32';
    for (const port of ports) {
        if (isWin) freePortWindows(port);
        else freePortUnix(port);
    }
    killOrphanedDevProcesses(projectRoot);
}
