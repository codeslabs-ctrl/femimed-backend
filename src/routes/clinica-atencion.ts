import express, { Request, Response } from 'express';
import { ClinicaAtencionController } from '../controllers/clinica-atencion.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { adminSecurityMiddleware } from '../middleware/security.js';

const router = express.Router();
const controller = new ClinicaAtencionController();

// Listado (para dropdown): cualquier usuario autenticado
router.get('/', authenticateToken, (req: Request, res: Response) => controller.list(req, res));
router.get('/:id', authenticateToken, (req: Request, res: Response) => controller.getById(req, res));

// CRUD completo: solo administrador
router.post('/', adminSecurityMiddleware, (req: Request, res: Response) => controller.create(req, res));
router.put('/:id', adminSecurityMiddleware, (req: Request, res: Response) => controller.update(req, res));
router.delete('/:id', adminSecurityMiddleware, (req: Request, res: Response) => controller.delete(req, res));

export default router;
