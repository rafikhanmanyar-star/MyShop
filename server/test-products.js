import { DatabaseService } from './dist/services/databaseService.js';
import 'dotenv/config';

async function fixMobileSettings() {
    const db = new DatabaseService(process.env.DATABASE_URL);
    try {
        const tenants = await db.query('SELECT id FROM tenants WHERE slug = $1', ['g-9']);
        if (tenants.length > 0) {
            await db.execute('INSERT INTO mobile_ordering_settings (tenant_id, is_enabled) VALUES ($1, TRUE) ON CONFLICT (tenant_id) DO UPDATE SET is_enabled = TRUE', [tenants[0].id]);
            console.log('Successfully enabled mobile ordering for shop: g-9');
        } else {
            console.log('Tenant g-9 not found!');
        }

        // Test the API endpoint directly via Fetch
        const res = await fetch('http://localhost:3000/api/mobile/g-9/info');
        console.log('API Status:', res.status);
        console.log('API Response:', await res.text());
    } catch (err) {
        console.error('Script Error:', err);
    } finally {
        process.exit(0);
    }
}
fixMobileSettings();
