import { UserRepository, UserData } from '../repositories/user.repository.js';
import { UsuarioRepository } from '../repositories/usuario.repository.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export class AuthService {
  private userRepository: UserRepository;
  private usuarioRepository: InstanceType<typeof UsuarioRepository>;

  constructor() {
    this.userRepository = new UserRepository();
    this.usuarioRepository = new UsuarioRepository();
  }


  async login(username: string, password: string): Promise<{ token: string; user: any }> {
    try {
      console.log('🔐 AuthService.login - Intentando login para username:', username);
      
      // Buscar usuario por username usando el repositorio (funciona con PostgreSQL y Supabase)
      const userData = await this.usuarioRepository.findByUsername(username);
      console.log('🔍 Usuario encontrado:', userData ? 'Sí' : 'No');

      if (!userData) {
        console.log('❌ Usuario no encontrado o inactivo para username:', username);
        throw new Error('Usuario no encontrado o inactivo');
      }

      // Verificar contraseña usando bcrypt
      console.log('🔐 Verificando contraseña...');
      const isValidPassword = await bcrypt.compare(password, userData.password_hash);
      console.log('🔐 Contraseña válida:', isValidPassword);
      
      if (!isValidPassword) {
        console.log('❌ Contraseña incorrecta para username:', username);
        throw new Error('Contraseña incorrecta');
      }

      // Generar JWT token
      const jwtSecret = process.env['JWT_SECRET'] || 'femimed-secret-key';
      console.log('🔐 Generando JWT token...');
      const token = jwt.sign(
        { 
          userId: userData.id, 
          username: userData.username, 
          rol: userData.rol,
          medico_id: userData.medico_id 
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      // Preparar datos del usuario para respuesta
      const user = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        rol: userData.rol,
        medico_id: userData.medico_id,
        first_login: userData.first_login,
        password_changed_at: userData.password_changed_at
      };

      console.log('✅ Login exitoso para username:', username, 'rol:', userData.rol);
      return {
        token,
        user
      };
    } catch (error) {
      console.error('❌ Error en AuthService.login:', error);
      const errorMessage = (error as Error).message;
      console.error('❌ Mensaje de error:', errorMessage);
      throw new Error(`Login failed: ${errorMessage}`);
    }
  }


  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      // Verificar que el usuario existe y obtener su contraseña actual usando el repositorio
      const userData = await this.usuarioRepository.findById(userId.toString());

      if (!userData) {
        throw new Error('Usuario no encontrado');
      }

      // Solo verificar contraseña actual si NO es el primer login
      if (!userData.first_login) {
        const isValidPassword = await bcrypt.compare(currentPassword, userData.password_hash);
        if (!isValidPassword) {
          throw new Error('Contraseña actual incorrecta');
        }
      }

      // Encriptar nueva contraseña
      const saltRounds = 10;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Actualizar contraseña y marcar que ya no es primer login usando el repositorio
      await this.usuarioRepository.update(userId.toString(), {
        password_hash: newPasswordHash,
        first_login: false,
        password_changed_at: new Date().toISOString()
      } as any);

      return {
        success: true,
        message: 'Contraseña actualizada exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message
      };
    }
  }


  async getUserByEmail(email: string): Promise<UserData | null> {
    try {
      return await this.userRepository.findByEmail(email);
    } catch (error) {
      throw new Error(`Get user by email failed: ${(error as Error).message}`);
    }
  }

  async validateUser(userId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findById(userId);
      return user !== null;
    } catch (error) {
      return false;
    }
  }
}
