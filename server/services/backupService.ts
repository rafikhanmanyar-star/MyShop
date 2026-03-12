/**
 * Backup and restore: full database backup/restore (SQLite file copy, PostgreSQL pg_dump/psql).
 * Backups are stored in ./backups (or BACKUP_DIR). Restore overwrites current data.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getDatabaseService, closeAndResetDatabase } from './databaseService.js';

const BACKUP_PREFIX = 'myshop-backup-';
const BACKUP_EXT_SQLITE = '.db';
const BACKUP_EXT_PG = '.sql';

function getBackupDir(): string {
  const dir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.resolve(dir);
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function isSafeFilename(name: string): boolean {
  return path.basename(name) === name && !name.includes('..') && name.startsWith(BACKUP_PREFIX);
}

export interface BackupEntry {
  id: string;
  filename: string;
  createdAt: string;
  sizeInBytes: number;
}

export class BackupService {
  private get db() {
    return getDatabaseService();
  }

  private get type(): 'postgres' | 'sqlite' {
    return this.db.getType();
  }

  private get connectionString(): string {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    return url;
  }

  /** Create a full backup; returns the backup filename. */
  async createBackup(): Promise<{ filename: string; createdAt: string; sizeInBytes: number }> {
    const dir = getBackupDir();
    const ts = safeTimestamp();

    if (this.type === 'sqlite') {
      const dbPath = this.connectionString.replace(/^sqlite:\/\//i, '').trim();
      if (!dbPath) throw new Error('Invalid SQLite path in DATABASE_URL');
      const resolvedDb = path.resolve(dbPath);
      const filename = `${BACKUP_PREFIX}${ts}${BACKUP_EXT_SQLITE}`;
      const backupPath = path.join(dir, filename);
      fs.copyFileSync(resolvedDb, backupPath);
      const stat = fs.statSync(backupPath);
      return {
        filename,
        createdAt: new Date().toISOString(),
        sizeInBytes: stat.size,
      };
    }

    // PostgreSQL: pg_dump to .sql (plain, with --clean so restore overwrites)
    const filename = `${BACKUP_PREFIX}${ts}${BACKUP_EXT_PG}`;
    const backupPath = path.join(dir, filename);
    await this.runPgDump(backupPath);
    const stat = fs.statSync(backupPath);
    return {
      filename,
      createdAt: new Date().toISOString(),
      sizeInBytes: stat.size,
    };
  }

  private runPgDump(outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-d', this.connectionString,
        '--no-owner',
        '--no-acl',
        '--clean',
        '--if-exists',
        '-f', outPath,
      ];
      const child = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `pg_dump exited with code ${code}. Is pg_dump installed and in PATH?`));
      });
      child.on('error', (err) => reject(err));
    });
  }

  /** List backup files (newest first). */
  async listBackups(): Promise<BackupEntry[]> {
    const dir = getBackupDir();
    const ext = this.type === 'sqlite' ? BACKUP_EXT_SQLITE : BACKUP_EXT_PG;
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(ext));
    const entries: BackupEntry[] = [];
    for (const f of files) {
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        const createdAt = stat.mtime.toISOString();
        entries.push({
          id: f,
          filename: f,
          createdAt,
          sizeInBytes: stat.size,
        });
      } catch {
        // skip if unreadable
      }
    }
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return entries;
  }

  /**
   * Restore from a backup. Overwrites current database.
   * For SQLite: closes DB, copies backup over main file, clears singleton.
   * For PostgreSQL: runs psql with the backup SQL file (which includes --clean so it drops objects first).
   */
  async restoreBackup(filename: string): Promise<void> {
    if (!isSafeFilename(filename)) {
      throw new Error('Invalid backup filename');
    }
    const dir = getBackupDir();
    const backupPath = path.join(dir, filename);
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    if (this.type === 'sqlite') {
      const dbPath = this.connectionString.replace(/^sqlite:\/\//i, '').trim();
      if (!dbPath) throw new Error('Invalid SQLite path in DATABASE_URL');
      const resolvedDb = path.resolve(dbPath);
      await closeAndResetDatabase();
      fs.copyFileSync(backupPath, resolvedDb);
      return;
    }

    // PostgreSQL: run psql -f backup.sql
    await this.runPsql(backupPath);
    // Optionally reconnect so the pool picks up restored state
    await closeAndResetDatabase();
  }

  private runPsql(sqlPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-d', this.connectionString, '-f', sqlPath];
      const child = spawn('psql', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `psql exited with code ${code}. Is psql installed and in PATH?`));
      });
      child.on('error', (err) => reject(err));
    });
  }
}

let _instance: BackupService | null = null;

export function getBackupService(): BackupService {
  if (!_instance) _instance = new BackupService();
  return _instance;
}
