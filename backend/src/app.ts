import express, { type Express, type Request, type Response } from 'express';
import path from 'node:path';
import { contextsRouter } from './routes/contexts.js';
import { kubeconfigRouter } from './routes/kubeconfig.js';
import { namespacesRouter } from './routes/namespaces.js';
import { podsRouter } from './routes/pods.js';

/**
 * Builds the Express app. Kept separate from the server bootstrap so it can be
 * imported by tests without opening a socket.
 *
 * ops-union is read-only: only GET routes live here. Cluster read endpoints
 * (pods, describe, metrics) and the log WebSocket are added in later phases.
 */
export function createApp(options: { frontendDist?: string; internalToken?: string } = {}): Express {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  if (options.internalToken) {
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.setHeader('Set-Cookie', `ops-union-capability=${encodeURIComponent(options.internalToken!)}; HttpOnly; SameSite=Strict; Path=/`);
      next();
    });
  }
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'ops-union-backend', readOnly: true });
  });

  app.use('/api/contexts', contextsRouter);
  app.use('/api/kubeconfig', kubeconfigRouter);
  app.use('/api/namespaces', namespacesRouter);
  app.use('/api/pods', podsRouter);

  if (options.frontendDist) {
    app.use(express.static(options.frontendDist));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(options.frontendDist!, 'index.html'));
    });
  }

  return app;
}
