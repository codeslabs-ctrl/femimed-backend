import express from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validation.js';
// import { authenticateToken } from '../middleware/auth.js';
import { 
  authSecurityMiddleware,
  validateLogin
} from '../middleware/security.js';
import { 
  SignUpRequest, 
  SignInRequest, 
  ResetPasswordRequest, 
  UpdateUserRequest
} from '../types/index.js';
import Joi from 'joi';

const router = express.Router();
const authController = new AuthController();

// Validation schemas for auth endpoints
const authSchemas = {
  signUp: Joi.object<SignUpRequest>({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    user_metadata: Joi.object({
      first_name: Joi.string().optional(),
      last_name: Joi.string().optional(),
      phone: Joi.string().optional()
    }).optional()
  }),
  
  signIn: Joi.object<SignInRequest>({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  
  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  }),
  
  resetPassword: Joi.object<ResetPasswordRequest>({
    email: Joi.string().email().required()
  }),
  
  regenerateOTP: Joi.object({
    email: Joi.string().email().required()
  }),
  
  changePassword: Joi.object({
    currentPassword: Joi.string().optional().allow(''),
    newPassword: Joi.string().min(6).required(),
    isFirstLogin: Joi.boolean().optional()
  }),
  
  updateUser: Joi.object<UpdateUserRequest>({
    email: Joi.string().email().optional(),
    password: Joi.string().min(6).optional(),
    user_metadata: Joi.object().optional()
  })
};

// Auth routes con middlewares de seguridad
router.post('/signup', validateRequest(authSchemas.signUp), (req, res) => authController.signUp(req, res));
router.post('/signin', validateLogin, (req, res) => authController.signIn(req, res));
router.post('/login', validateLogin, (req, res) => authController.login(req, res));
router.post('/signout', (req, res) => authController.signOut(req, res));
router.get('/user', authSecurityMiddleware, (req: any, res: any) => authController.getCurrentUser(req, res));
router.put('/user', authSecurityMiddleware, validateRequest(authSchemas.updateUser), (req: any, res: any) => authController.updateUser(req, res));
router.post('/reset-password', validateRequest(authSchemas.resetPassword), (req, res) => authController.resetPassword(req, res));
router.post('/regenerate-otp', validateRequest(authSchemas.regenerateOTP), (req, res) => authController.regenerateOTP(req, res));
router.post('/change-password', authSecurityMiddleware, validateRequest(authSchemas.changePassword), (req: any, res: any) => authController.changePassword(req, res));

// Debug endpoint to check current user role
router.get('/debug-user', authSecurityMiddleware, (req: any, res: any) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      role: req.user?.rol,
      userId: req.user?.userId,
      medico_id: req.user?.medico_id
    }
  });
});

export default router;
