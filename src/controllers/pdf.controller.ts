import { Request, Response } from 'express';
import { PDFService } from '../services/pdf.service';

interface AuthReq extends Request {
  user?: { userId: number; username: string; rol: string; medico_id?: number };
}

export class PDFController {
  private pdfService: PDFService;

  constructor() {
    this.pdfService = new PDFService();
  }

  /**
   * Genera y devuelve un PDF de un informe médico
   */
  async generarPDFInforme(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const informeId = parseInt(id || '0');

      if (!informeId || isNaN(informeId)) {
        res.status(400).json({
          success: false,
          message: 'ID de informe inválido'
        });
        return;
      }

      console.log(`🔄 Generando PDF para informe ${informeId}`);
      console.log('📋 Parámetros recibidos:', { id, informeId });

      // Generar el PDF
      const pdfBuffer = await this.pdfService.generarPDFInforme(informeId);

      // Configurar headers para descarga
      const timestamp = new Date().getTime();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="informe-${informeId}-${timestamp}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Enviar el PDF
      res.send(pdfBuffer);

      console.log(`✅ PDF enviado exitosamente para informe ${informeId}`);

    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Error generando el PDF del informe',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  /**
   * POST /api/v1/pdf/receta-medico
   */
  async generarPDFRecetaMedico(req: AuthReq, res: Response): Promise<void> {
    try {
      const user = req.user;
      const medicoIdJwt = user?.medico_id != null ? Number(user.medico_id) : NaN;
      if (!user || user.rol !== 'medico' || !Number.isFinite(medicoIdJwt) || medicoIdJwt <= 0) {
        res.status(403).json({ success: false, message: 'Solo médicos pueden generar el récipe' });
        return;
      }

      const body = req.body as {
        tipo?: string;
        contenido?: string;
        paciente_id?: number | null;
        fecha_emision?: string | null;
        pies_clinica_ids?: number[];
      };

      const tipoRaw = (body.tipo || 'recipe').toLowerCase();
      const tipo: 'recipe' | 'indicaciones' | 'ambos' =
        tipoRaw === 'indicaciones' ? 'indicaciones' : tipoRaw === 'ambos' ? 'ambos' : 'recipe';
      const contenido = typeof body.contenido === 'string' ? body.contenido : '';

      const pacienteId = body.paciente_id != null ? Number(body.paciente_id) : undefined;
      const fechaEmision = body.fecha_emision || undefined;
      const piesClinicaIds = Array.isArray(body.pies_clinica_ids)
        ? body.pies_clinica_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [];

      const pdfPacienteId =
        pacienteId != null && !Number.isNaN(pacienteId) ? pacienteId : null;

      const pdfBuffer = await this.pdfService.generarPDFRecetaMedico({
        medicoId: medicoIdJwt,
        tipo,
        contenido,
        pacienteId: pdfPacienteId,
        fechaEmision: fechaEmision || null,
        piesClinicaIds
      });

      const label =
        tipo === 'indicaciones' ? 'indicaciones' : tipo === 'ambos' ? 'ambos' : 'recipe';
      const ts = new Date().getTime();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receta-${label}-${ts}.pdf"`);
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.setHeader('Cache-Control', 'no-cache');
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('❌ Error generando PDF récipe:', error);
      const msg = error?.message || 'Error generando el PDF';
      const status = msg.includes('obligatorio') || msg.includes('no encontrado') ? 400 : 500;
      res.status(status).json({
        success: false,
        message: msg
      });
    }
  }
}
