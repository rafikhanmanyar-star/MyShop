/**
 * Kill leftover Node dev processes for this repo (Windows orphans from cmd.exe / npm nesting).
 */
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

/** Command-line fragments that identify MyShop dev servers (not migrate/build one-offs). */
const DEV_CMD_MARKERS = [
    'tsx\\dist\\cli',
    'tsx/dist/cli',
    'vite\\bin\\vite',
    'vite/bin/vite',
    'next\\dist\\bin\\next',
    'next/dist/bin/next',
    'concurrently\\dist',
    'concurrently/dist',
    'run-dev.mjs',
    'wait-and-electron.mjs',
];

function commandLineLooksLikeDev(commandLine) {
    if (!commandLine) return false;
    return DEV_CMD_MARKERS.some((m) => commandLine.includes(m));
}

/**
 * Force-stop Node processes started for local dev in this project tree.
 * Safe to call repeatedly; ignores processes that are already gone.
 */
export function killOrphanedDevProcesses(projectRoot) {
    const root = projectRoot.replace(/\\/g, '/');
    const isWin = platform() === 'win32';

    if (isWin) {
        const rootLit = projectRoot.replace(/'/g, "''");
        const markers = DEV_CMD_MARKERS.map((m) => m.replace(/\\/g, '\\\\')).join('|');
        const ps = [
            "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" |",
            `Where-Object { $_.CommandLine -and $_.CommandLine -like '*${rootLit}*' } |`,
            `Where-Object { $_.CommandLine -match '${markers}' } |`,
            'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
        ].join(' ');
        try {
            execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
                stdio: 'ignore',
                timeout: 20000,
            });
        } catch {
            /* none matched or access denied */
        }
        return;
    }

    try {
        const out = execSync(`pgrep -af ${JSON.stringify(root)}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        for (const line of out.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || !commandLineLooksLikeDev(trimmed)) continue;
            const pid = trimmed.split(/\s+/)[0];
            if (/^\d+$/.test(pid)) {
                try {
                    execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
                } catch {
                    /* gone */
                }
            }
        }
    } catch {
        /* pgrep found nothing */
    }
}

/** Kill a process and its descendants (Windows taskkill /T). */
export function killProcessTree(pid) {
    if (!pid) return;
    try {
        if (platform() === 'win32') {
            execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
        } else {
            process.kill(-pid, 'SIGTERM');
        }
    } catch {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            /* already gone */
        }
    }
}
