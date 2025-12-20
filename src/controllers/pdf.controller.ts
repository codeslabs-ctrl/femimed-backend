import { Request, Response } from 'express';
import { PDFService } from '../services/pdf.service';

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
}
