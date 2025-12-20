import express from 'express';
import { FirmaController } from '../controllers/firma.controller.js';
import { uploadFirma } from '../middleware/upload.middleware.js';
import { authenticateToken } from '../middleware/auth.js';
import { medicoSecurityMiddleware } from '../middleware/security.js';

const router = express.Router();
const firmaController = new FirmaController();

// Rutas para manejo de firmas digitales
// Solo médicos y administradores pueden gestionar firmas

// POST /api/v1/firmas/:id/subir - Subir firma digital
router.post('/:id/subir', 
  authenticateToken, 
  medicoSecurityMiddleware, 
  uploadFirma.single('firma'), 
  (req: any, res: any) => firmaController.subirFirma(req, res)
);

// GET /api/v1/firmas/:id - Obtener firma digital
router.get('/:id', 
  authenticateToken, 
  medicoSecurityMiddleware, 
  (req: any, res: any) => firmaController.obtenerFirma(req, res)
);

// DELETE /api/v1/firmas/:id - Eliminar firma digital
router.delete('/:id', 
  authenticateToken, 
  medicoSecurityMiddleware, 
  (req: any, res: any) => firmaController.eliminarFirma(req, res)
);

export default router;
