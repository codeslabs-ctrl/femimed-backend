import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { requireExternalApiKey } from '../../../middleware/external-api-key.js';
import { ApiResponse } from '../../../types/index.js';

const router = express.Router();

// API Key para automatizaciones (N8N)
router.use(requireExternalApiKey('EXTERNAL_N8N_API_KEYS'));

/**
 * Endpoint base para difusión.
 * Nota: aquí solo registramos/aceptamos la solicitud. El envío real se integra luego (N8N/webhook/cola).
 */
router.post('/whatsapp', (req: Request, res: Response<ApiResponse>) => {
  const broadcastId = crypto.randomUUID();
  const response: ApiResponse = {
    success: true,
    data: {
      message: 'Solicitud de difusión recibida',
      broadcast_id: broadcastId,
      received_at: new Date().toISOString(),
      payload: req.body
    }
  };
  res.status(202).json(response);
});

export default router;


