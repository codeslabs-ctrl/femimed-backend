import { Router } from 'express';
import { PDFController } from '../controllers/pdf.controller';
import { authenticateToken } from '../middleware/auth';
import { verifyClinica } from '../middleware/clinica.middleware';

const router = Router();
const pdfController = new PDFController();

// Aplicar middleware de autenticación y clínica a todas las rutas
router.use(authenticateToken);
router.use(verifyClinica);

/**
 * @route GET /api/v1/pdf/informe/:id
 * @desc Genera y descarga un PDF de un informe médico
 * @access Private
 */
router.get('/informe/:id', pdfController.generarPDFInforme.bind(pdfController));

export default router;


