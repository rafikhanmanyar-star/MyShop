import { getDatabaseService } from './services/databaseService.js';
import process from 'process';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
    try {
        const db = getDatabaseService();
        const rows = await db.query('SELECT name FROM schema_migrations');
        console.log('Applied migrations:', rows);
    } catch (err) {
        console.error('Error checking migrations:', err);
    } finally {
        process.exit(0);
    }
}
check();
