import express from 'express';
import { MedicoController } from '../controllers/medico.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { eliminarMedicoSecurityMiddleware } from '../middleware/security.js';

const router = express.Router();
const medicoController = new MedicoController();

// Medico routes
// IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros dinámicos
router.get('/', (req, res) => medicoController.getAllMedicos(req, res));
router.get('/search', (req, res) => medicoController.searchMedicos(req, res));
router.get('/by-especialidad/:especialidadId', (req, res) => medicoController.getMedicosByEspecialidad(req, res));
router.post('/', authenticateToken, (req, res) => medicoController.createMedico(req, res));
// Activar médico inactivo - DEBE ir antes de /:id
router.patch('/:id/activar', authenticateToken, (req: any, res: any) => medicoController.activarMedico(req, res));
// Rutas con parámetros dinámicos al final
router.get('/:id', (req, res) => medicoController.getMedicoById(req, res));
router.put('/:id', authenticateToken, (req: any, res: any) => medicoController.updateMedico(req, res));
// Solo administrador y secretaria pueden eliminar médicos
router.delete('/:id', eliminarMedicoSecurityMiddleware, (req: any, res: any) => medicoController.deleteMedico(req, res));

export default router;
