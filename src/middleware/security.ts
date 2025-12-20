import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import Joi from 'joi';
import jwt from 'jsonwebtoken';

// Extender Request interface
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Headers de seguridad
export const securityHeaders = helmet();

// CORS configurado para DemoMed
const allowedOrigins = [
  process.env['FRONTEND_URL'] || 'http://localhost:4200',
  'https://demomed.codes-labs.com',
  'https://www.demomed.codes-labs.com',
  'http://localhost:4200' // Desarrollo
].filter(Boolean); // Elimina valores undefined/null

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Permitir requests sin origen (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar si el origen está permitido
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// Rate limiting eliminado - No se aplican límites de tiempo a las peticiones

// Middleware de autenticación JWT
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Token de acceso requerido' });
    return;
  }

  jwt.verify(token, process.env['JWT_SECRET'] || 'default-secret', (err: any, user: any) => {
    if (err) {
      res.status(403).json({ error: 'Token inválido' });
      return;
    }
    req.user = user;
    next();
  });
};

// Middleware de autorización por roles
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const userRole = (req.user as any).rol;
    
    // Mapeo de roles de la base de datos a roles del middleware
    const roleMapping: { [key: string]: string[] } = {
      'administrador': ['admin', 'administrador'],
      'medico': ['medico'],
      'admin': ['admin', 'administrador'] // Para compatibilidad
    };
    
    // Verificar si el rol del usuario está permitido
    const allowedRoles = roles.flatMap(role => roleMapping[role] || [role]);
    
    if (!allowedRoles.includes(userRole)) {
      console.log(`🚫 Acceso denegado: Usuario rol="${userRole}", Roles requeridos=${roles.join(',')}`);
      res.status(403).json({ 
        error: 'Acceso denegado',
        details: `Rol requerido: ${roles.join(' o ')}, Rol actual: ${userRole}`
      });
      return;
    }

    next();
  };
};

// Middleware de validación de input
export const validateInput = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0]?.message || 'Error de validación' });
      return;
    }
    next();
  };
};

// Validación específica para login
export const validateLogin = validateInput(Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required()
}));

// Validación específica para informes médicos
export const validateInforme = validateInput(Joi.object({
  titulo: Joi.string().min(5).max(200).required(),
  tipo_informe: Joi.string().required(),
  contenido: Joi.string().min(10).required(),
  paciente_id: Joi.number().required(),
  medico_id: Joi.number().required(),
  template_id: Joi.number().optional(),
  estado: Joi.string().valid('borrador', 'finalizado', 'firmado', 'enviado').default('borrador'),
  fecha_emision: Joi.string().allow('').optional(),
  observaciones: Joi.string().allow('').optional(),
  creado_por: Joi.number().required()
}));

// Validación para actualización de informes (campos opcionales)
export const validateInformeUpdate = validateInput(Joi.object({
  titulo: Joi.string().min(5).max(200).optional(),
  tipo_informe: Joi.string().optional(),
  contenido: Joi.string().min(10).optional(),
  paciente_id: Joi.number().optional(),
  medico_id: Joi.number().optional(),
  template_id: Joi.number().optional(),
  estado: Joi.string().valid('borrador', 'finalizado', 'firmado', 'enviado').optional(),
  fecha_emision: Joi.string().allow('').optional(),
  fecha_envio: Joi.string().isoDate().optional(),
  observaciones: Joi.string().allow('').optional(),
  creado_por: Joi.number().optional()
}));

// Validación específica para pacientes (solo datos básicos)
export const validatePaciente = validateInput(Joi.object({
  nombres: Joi.string().min(2).required(),
  apellidos: Joi.string().min(2).required(),
  cedula: Joi.string().min(7).optional(),
  email: Joi.string().email().required(),
  telefono: Joi.string().min(8).required(),
  edad: Joi.number().integer().min(0).max(150).required(),
  sexo: Joi.string().valid('Masculino', 'Femenino', 'Otro').required(),
  activo: Joi.boolean().optional()
}));

// Validación para actualización de pacientes (incluye campos médicos opcionales)
export const validatePacienteUpdate = validateInput(Joi.object({
  nombres: Joi.string().min(2).optional(),
  apellidos: Joi.string().min(2).optional(),
  cedula: Joi.string().min(7).optional(),
  email: Joi.string().email().optional(),
  telefono: Joi.string().min(8).optional(),
  edad: Joi.number().integer().min(0).max(150).optional(),
  sexo: Joi.string().valid('Masculino', 'Femenino', 'Otro').optional(),
  motivo_consulta: Joi.string().allow('').optional(),
  diagnostico: Joi.string().allow('').optional(),
  conclusiones: Joi.string().allow('').optional(),
  plan: Joi.string().allow('').optional()
}));

// Validación específica para consultas
export const validateConsulta = validateInput(Joi.object({
  paciente_id: Joi.number().required(),
  medico_id: Joi.number().required(),
  fecha_consulta: Joi.date().required(),
  motivo: Joi.string().min(5).required(),
  estado: Joi.string().valid('programada', 'en_proceso', 'completada', 'cancelada').default('programada')
}));

// Middleware de seguridad para autenticación
export const authSecurityMiddleware = [authenticateToken];

// Middleware de seguridad para médicos
export const medicoSecurityMiddleware = [authenticateToken, requireRole(['medico', 'administrador'])];

// Middleware de seguridad para administradores
export const adminSecurityMiddleware = [authenticateToken, requireRole(['administrador'])];

// Middleware de seguridad para secretaria
export const secretariaSecurityMiddleware = [authenticateToken, requireRole(['secretaria', 'administrador'])];

// Middleware de seguridad para finanzas
export const finanzasSecurityMiddleware = [authenticateToken, requireRole(['finanzas', 'administrador'])];

// Middleware para médicos y secretaria (acceso a pacientes/consultas)
export const medicoSecretariaMiddleware = [authenticateToken, requireRole(['medico', 'secretaria', 'administrador'])];

// Middleware para roles que pueden ver reportes
export const reportesSecurityMiddleware = [authenticateToken, requireRole(['medico', 'secretaria', 'finanzas', 'administrador'])];

// Middleware específico para eliminación de médicos (solo administrador y secretaria)
export const eliminarMedicoSecurityMiddleware = [authenticateToken, requireRole(['administrador', 'secretaria'])];