import express, { Request, Response } from 'express';
import { ApiResponse } from '../../../types/index.js';
import { requireExternalApiKey } from '../../../middleware/external-api-key.js';
import { ExternalRequestsService } from '../../../services/external-requests.service.js';

const router = express.Router();

router.use(requireExternalApiKey('EXTERNAL_PATIENT_APP_API_KEYS'));

// POST /api/v1/external/v1/reports/requests
router.post('/requests', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const body = (req.body || {}) as any;

    const paciente_id = Number(body.paciente_id);
    const medico_id = body.medico_id !== undefined ? Number(body.medico_id) : undefined;
    const tipo_informe = String(body.tipo_informe ?? '').trim();
    const motivo = String(body.motivo ?? '').trim();

    if (!paciente_id || paciente_id <= 0 || Number.isNaN(paciente_id)) {
      res.status(400).json({ success: false, error: { message: 'paciente_id inválido' } });
      return;
    }
    if (body.medico_id !== undefined && (!medico_id || medico_id <= 0 || Number.isNaN(medico_id))) {
      res.status(400).json({ success: false, error: { message: 'medico_id inválido' } });
      return;
    }
    if (!tipo_informe) {
      res.status(400).json({ success: false, error: { message: 'tipo_informe es requerido' } });
      return;
    }
    if (!motivo) {
      res.status(400).json({ success: false, error: { message: 'motivo es requerido' } });
      return;
    }

    const created = await ExternalRequestsService.createReportRequest({
      paciente_id,
      ...(medico_id ? { medico_id } : {}),
      tipo_informe,
      motivo
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: (error as Error).message } });
  }
});

// GET /api/v1/external/v1/reports?paciente_id=123
router.get('/', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const pacienteId = Number((req.query as any)?.paciente_id);
    if (!pacienteId || pacienteId <= 0 || Number.isNaN(pacienteId)) {
      res.status(400).json({ success: false, error: { message: 'paciente_id es requerido (query)' } });
      return;
    }

    const items = await ExternalRequestsService.listReportsByPaciente(pacienteId);
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: (error as Error).message } });
  }
});

export default router;


