import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { getKubeConfigStatus, reloadKubeConfig } from '../kube/kubeconfig.js';

export const kubeconfigRouter = Router();

kubeconfigRouter.get('/status', (_req: Request, res: Response) => {
  res.json(getKubeConfigStatus());
});

kubeconfigRouter.post('/select', (req: Request, res: Response) => {
  if (!config.internalToken || req.get('x-ops-union-token') !== config.internalToken) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  const selectedPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
  if (!selectedPath) {
    res.status(400).json({ error: 'Select a kubeconfig file.' });
    return;
  }

  try {
    reloadKubeConfig(selectedPath);
    res.json(getKubeConfigStatus());
  } catch {
    res.status(400).json({ error: 'Could not read the selected kubeconfig.' });
  }
});

kubeconfigRouter.post('/reset', (req: Request, res: Response) => {
  if (!config.internalToken || req.get('x-ops-union-token') !== config.internalToken) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  try {
    reloadKubeConfig(null);
    res.json(getKubeConfigStatus());
  } catch {
    res.status(400).json({ error: 'Could not reset the kubeconfig.' });
  }
});