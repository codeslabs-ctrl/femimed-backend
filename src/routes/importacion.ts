import express from 'express';
import { ImportacionController, uploadWordFiles, uploadSingleWordFile } from '../controllers/importacion.controller.js';
import { medicoSecretariaMiddleware } from '../middleware/security.js';

const router = express.Router();
const importacionController = new ImportacionController();

// Ruta para importar un solo documento
router.post('/single', 
  medicoSecretariaMiddleware, 
  uploadSingleWordFile, 
  (req: any, res: any) => importacionController.importarDocumento(req, res)
);

// Ruta para importar múltiples documentos
router.post('/multiple', 
  medicoSecretariaMiddleware, 
  uploadWordFiles, 
  (req: any, res: any) => importacionController.importarMultiplesDocumentos(req, res)
);

export default router;

