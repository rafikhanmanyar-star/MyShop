import type { Request, Response } from 'express';
import express from 'express';

function resolveRemoteUploadsOrigin(): string | undefined {
    const explicit = process.env.REMOTE_UPLOADS_ORIGIN?.trim();
    if (explicit) return explicit.replace(/\/$/, '');

    // Local API + Render Postgres: files usually live on the deployed API disk.
    if (
        process.env.NODE_ENV !== 'production' &&
        process.env.DATABASE_URL?.includes('render.com')
    ) {
        const fromEnv = process.env.RENDER_API_URL?.trim();
        if (fromEnv) return fromEnv.replace(/\/$/, '').replace(/\/api$/, '');
        return 'https://myshop-api-9pd4.onrender.com';
    }

    return undefined;
}

/**
 * Serves /uploads from local disk; when missing and a remote origin is configured,
 * fetches the same path from the remote API (e.g. Render) so local dev works with a cloud DB.
 */
export function createUploadsMiddleware(uploadsPath: string) {
    const remoteOrigin = resolveRemoteUploadsOrigin();

    if (remoteOrigin) {
        console.log('📂 Uploads fallback enabled:', remoteOrigin);
    }

    const localStatic = express.static(uploadsPath, { fallthrough: true });

    const remoteFallback = async (req: Request, res: Response) => {
        if (!remoteOrigin) {
            res.status(404).end();
            return;
        }

        const rel = req.path.replace(/^\//, '');
        if (!rel) {
            res.status(404).end();
            return;
        }

        const remoteUrl = `${remoteOrigin}/uploads/${rel}`;
        try {
            const upstream = await fetch(remoteUrl);
            if (!upstream.ok) {
                res.status(upstream.status).end();
                return;
            }
            const contentType = upstream.headers.get('content-type');
            if (contentType) res.setHeader('Content-Type', contentType);
            const cacheControl = upstream.headers.get('cache-control');
            if (cacheControl) res.setHeader('Cache-Control', cacheControl);
            const buf = Buffer.from(await upstream.arrayBuffer());
            res.send(buf);
        } catch {
            res.status(502).json({ error: 'Failed to fetch upload from remote origin' });
        }
    };

    return [localStatic, remoteFallback];
}
