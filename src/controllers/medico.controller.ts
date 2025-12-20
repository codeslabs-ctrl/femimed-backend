import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import { EmailService } from '../services/email.service.js';
import bcrypt from 'bcrypt';

export class MedicoController {

  async getMedicoById(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const medicoId = parseInt(id);

      if (isNaN(medicoId) || medicoId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico ID' }
        };
        res.status(400).json(response);
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT m.*, e.nombre_especialidad
           FROM medicos m
           LEFT JOIN especialidades e ON m.especialidad_id = e.id
           WHERE m.id = $1`,
          [medicoId]
        );

        if (result.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Medico not found' }
          };
          res.status(404).json(response);
          return;
        }

        const medico = {
          ...result.rows[0],
          especialidad_nombre: result.rows[0].nombre_especialidad || 'Especialidad no encontrada'
        };

        const response: ApiResponse = {
          success: true,
          data: medico
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getAllMedicos(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const client = await postgresPool.connect();
      try {
        // Obtener médicos con JOIN a especialidades
        const medicosResult = await client.query(`
          SELECT m.*, e.nombre_especialidad
          FROM medicos m
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          ORDER BY m.nombres ASC
        `);
        const medicos = medicosResult.rows.map(medico => ({
          ...medico,
          especialidad_nombre: medico.nombre_especialidad || 'Especialidad no encontrada'
        }));

        const response: ApiResponse = {
          success: true,
          data: medicos
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async createMedico(req: Request<{}, ApiResponse, { nombres: string; apellidos: string; cedula?: string; email: string; telefono: string; especialidad_id: number; mpps?: string; cm?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      console.log('📥 Datos recibidos en createMedico:', req.body);
      const { nombres, apellidos, cedula, email, telefono, especialidad_id, mpps, cm } = req.body;

      console.log('🔍 Validando campos:');
      console.log('  - nombres:', nombres, typeof nombres);
      console.log('  - apellidos:', apellidos, typeof apellidos);
      console.log('  - cedula:', cedula, typeof cedula);
      console.log('  - email:', email, typeof email);
      console.log('  - telefono:', telefono, typeof telefono);
      console.log('  - especialidad_id:', especialidad_id, typeof especialidad_id);

      if (!nombres || !apellidos || !email || !telefono || !especialidad_id) {
        console.log('❌ Validación falló - campos faltantes');
        const response: ApiResponse = {
          success: false,
          error: { message: 'All fields are required' }
        };
        res.status(400).json(response);
        return;
      }

      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'demomed';

      const client = await postgresPool.connect();
      try {
        // Iniciar transacción
        await client.query('BEGIN');

        // Verificar si el email ya existe
        const emailCheck = await client.query(
          'SELECT id FROM medicos WHERE email = $1',
          [email]
        );

        if (emailCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          const response: ApiResponse = {
            success: false,
            error: { message: 'El email ya está registrado en el sistema' }
          };
          res.status(400).json(response);
          return;
        }

        // Verificar si la cédula ya existe (si se proporciona)
        if (cedula) {
          const cedulaCheck = await client.query(
            'SELECT id FROM medicos WHERE cedula = $1',
            [cedula]
          );

          if (cedulaCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            const response: ApiResponse = {
              success: false,
              error: { message: 'La cédula ya está registrada en el sistema' }
            };
            res.status(400).json(response);
            return;
          }
        }

        // Insertar en medicos
        const medicoResult = await client.query(
          `INSERT INTO medicos (nombres, apellidos, cedula, email, telefono, especialidad_id, mpps, cm)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [nombres, apellidos, cedula || null, email, telefono, especialidad_id, mpps || null, cm || null]
        );

        const newMedico = medicoResult.rows[0];
        const medicoId = newMedico.id;

        // Insertar en medicos_clinicas (activo tiene default true, fecha_asignacion tiene default)
        await client.query(
          `INSERT INTO medicos_clinicas (medico_id, clinica_alias)
           VALUES ($1, $2)
           ON CONFLICT (medico_id, clinica_alias) DO NOTHING`,
          [medicoId, clinicaAlias]
        );

        // Generar username del email (parte antes del @)
        const username = email.split('@')[0];
        
        if (!username) {
          throw new Error('Email inválido: no se puede generar username');
        }
        
        // Generar OTP de 8 dígitos
        const otp = Math.floor(10000000 + Math.random() * 90000000).toString();
        
        // Hash del OTP
        const hashedOtp = await bcrypt.hash(otp, 10);
        
        // Crear usuario con OTP temporal dentro de la transacción
        const usuarioResult = await client.query(
          `INSERT INTO usuarios (username, email, password_hash, rol, medico_id, activo, verificado, first_login, password_changed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [username, email, hashedOtp, 'medico', medicoId, true, false, true, null]
        );

        const newUser = usuarioResult.rows[0];

        // Confirmar transacción (médico, medicos_clinicas y usuario)
        await client.query('COMMIT');

        // Enviar email con OTP
        console.log('🚀 INICIANDO PROCESO DE EMAIL...');
        try {
          console.log('📧 Intentando enviar email a:', email);
          console.log('📧 Username generado:', username);
          console.log('📧 OTP generado:', otp);
          
          const emailService = new EmailService();
          const emailSent = await emailService.sendMedicoWelcomeEmail(
            email,
            {
              nombre: `${nombres} ${apellidos}`,
              username,
              userEmail: email,
              otp,
              expiresIn: '24 horas'
            }
          );

          if (emailSent) {
            console.log('✅ Email enviado exitosamente');
          } else {
            console.warn('⚠️ Email no enviado, pero médico y usuario creados correctamente');
          }
        } catch (emailError) {
          console.error('❌ Error enviando email:', emailError);
          console.error('❌ Detalles del error:', (emailError as Error).message);
          // No fallar la creación si falla el email
        }

        console.log('🏁 FINALIZANDO PROCESO DE EMAIL...');

        const response: ApiResponse = {
          success: true,
          data: {
            medico: newMedico,
            usuario: {
              id: newUser.id,
              username: newUser.username,
              email: newUser.email,
              rol: newUser.rol,
              first_login: newUser.first_login
            },
            message: 'Médico creado exitosamente. Se ha enviado un OTP por email para el primer acceso.'
          }
        };
        res.status(201).json(response);
      } catch (dbError: any) {
        // Revertir transacción en caso de error
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('❌ Error al hacer rollback:', rollbackError);
        }
        console.error('❌ PostgreSQL error creating medico:', dbError);
        
        // Verificar errores específicos
        if (dbError.code === '23505') { // Unique violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'Ya existe un médico con ese email o cédula' }
          };
          res.status(400).json(response);
          return;
        }
        
        if (dbError.code === '23503') { // Foreign key violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'La especialidad seleccionada no existe' }
          };
          res.status(400).json(response);
          return;
        }
        
        // Error genérico para el usuario
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo crear el médico. Por favor, verifique los datos e intente nuevamente.' }
        };
        res.status(400).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async updateMedico(req: Request<{ id: string }, ApiResponse, { nombres?: string; apellidos?: string; cedula?: string; email?: string; telefono?: string; especialidad_id?: number; mpps?: string; cm?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const medicoId = parseInt(id);

      if (isNaN(medicoId) || medicoId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico ID' }
        };
        res.status(400).json(response);
        return;
      }

      const client = await postgresPool.connect();
      try {
        // Verificar si el email ya existe en otro médico (si se está actualizando)
        if (updateData.email) {
          const emailCheck = await client.query(
            'SELECT id FROM medicos WHERE email = $1 AND id != $2',
            [updateData.email, medicoId]
          );

          if (emailCheck.rows.length > 0) {
            const response: ApiResponse = {
              success: false,
              error: { message: 'El email ya está registrado en el sistema' }
            };
            res.status(400).json(response);
            return;
          }
        }

        // Verificar si la cédula ya existe en otro médico (si se está actualizando)
        if (updateData.cedula) {
          const cedulaCheck = await client.query(
            'SELECT id FROM medicos WHERE cedula = $1 AND id != $2',
            [updateData.cedula, medicoId]
          );

          if (cedulaCheck.rows.length > 0) {
            const response: ApiResponse = {
              success: false,
              error: { message: 'La cédula ya está registrada en el sistema' }
            };
            res.status(400).json(response);
            return;
          }
        }

        // Construir query dinámico para UPDATE
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updateData.nombres !== undefined) {
          setClauses.push(`nombres = $${paramIndex}`);
          values.push(updateData.nombres);
          paramIndex++;
        }
        if (updateData.apellidos !== undefined) {
          setClauses.push(`apellidos = $${paramIndex}`);
          values.push(updateData.apellidos);
          paramIndex++;
        }
        if (updateData.cedula !== undefined) {
          setClauses.push(`cedula = $${paramIndex}`);
          values.push(updateData.cedula);
          paramIndex++;
        }
        if (updateData.email !== undefined) {
          setClauses.push(`email = $${paramIndex}`);
          values.push(updateData.email);
          paramIndex++;
        }
        if (updateData.telefono !== undefined) {
          setClauses.push(`telefono = $${paramIndex}`);
          values.push(updateData.telefono);
          paramIndex++;
        }
        if (updateData.especialidad_id !== undefined) {
          setClauses.push(`especialidad_id = $${paramIndex}`);
          values.push(updateData.especialidad_id);
          paramIndex++;
        }
        if (updateData.mpps !== undefined) {
          setClauses.push(`mpps = $${paramIndex}`);
          values.push(updateData.mpps);
          paramIndex++;
        }
        if (updateData.cm !== undefined) {
          setClauses.push(`cm = $${paramIndex}`);
          values.push(updateData.cm);
          paramIndex++;
        }

        if (setClauses.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'No hay campos para actualizar' }
          };
          res.status(400).json(response);
          return;
        }

        values.push(medicoId);
        const sqlQuery = `
          UPDATE medicos
          SET ${setClauses.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id = $${paramIndex}
          RETURNING *
        `;

        const result = await client.query(sqlQuery, values);

        if (result.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Médico no encontrado' }
          };
          res.status(404).json(response);
          return;
        }

        const response: ApiResponse = {
          success: true,
          data: result.rows[0]
        };
        res.json(response);
      } catch (dbError: any) {
        console.error('❌ PostgreSQL error updating medico:', dbError);
        
        if (dbError.code === '23505') { // Unique violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'Ya existe un médico con ese email o cédula' }
          };
          res.status(400).json(response);
          return;
        }
        
        if (dbError.code === '23503') { // Foreign key violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'La especialidad seleccionada no existe' }
          };
          res.status(400).json(response);
          return;
        }
        
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo actualizar el médico. Por favor, verifique los datos e intente nuevamente.' }
        };
        res.status(400).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error updating medico:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: 'No se pudo actualizar el médico. Por favor, verifique los datos e intente nuevamente.' }
      };
      res.status(400).json(response);
    }
  }

  async deleteMedico(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const medicoId = parseInt(id);

      if (isNaN(medicoId) || medicoId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID de médico inválido' }
        };
        res.status(400).json(response);
        return;
      }

      const client = await postgresPool.connect();
      try {
        // Verificar que el médico existe
        const medicoCheck = await client.query(
          'SELECT id, nombres, apellidos, activo FROM medicos WHERE id = $1',
          [medicoId]
        );

        if (medicoCheck.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Médico no encontrado' }
          };
          res.status(404).json(response);
          return;
        }

        const medico = medicoCheck.rows[0];

        // Verificar si el médico ya está inactivo
        if (!medico.activo) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'El médico ya está inactivo' }
          };
          res.status(400).json(response);
          return;
        }

        // Verificar si el médico tiene pacientes tratados
        const tienePacientesTratados = await this.verificarPacientesTratados(medicoId);

        if (tienePacientesTratados) {
          // Marcar como inactivo en lugar de eliminar
          await this.marcarMedicoComoInactivo(medicoId);
          
          const response: ApiResponse = {
            success: true,
            data: { 
              message: `Médico ${medico.nombres} ${medico.apellidos} marcado como inactivo (tiene pacientes tratados)`,
              accion: 'desactivado'
            }
          };
          res.json(response);
        } else {
          // Eliminación física completa
          await this.eliminarMedicoFisicamente(medicoId);
          
          const response: ApiResponse = {
            success: true,
            data: { 
              message: `Médico ${medico.nombres} ${medico.apellidos} eliminado completamente del sistema`,
              accion: 'eliminado'
            }
          };
          res.json(response);
        }
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error eliminando médico:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  /**
   * Verifica si un médico tiene pacientes tratados (solo consultas finalizadas)
   */
  private async verificarPacientesTratados(medicoId: number): Promise<boolean> {
    try {
      const client = await postgresPool.connect();
      try {
        // Verificar consultas FINALIZADAS (estado_consulta = 'finalizada' o tiene fecha_culminacion)
        const consultasResult = await client.query(
          `SELECT id FROM consultas_pacientes 
           WHERE medico_id = $1 
           AND (estado_consulta = 'finalizada' OR estado_consulta = 'completada' OR fecha_culminacion IS NOT NULL)
           LIMIT 1`,
          [medicoId]
        );

        if (consultasResult.rows.length > 0) {
          return true;
        }

        // Verificar historial médico
        const historialResult = await client.query(
          'SELECT id FROM historico_pacientes WHERE medico_id = $1 LIMIT 1',
          [medicoId]
        );

        if (historialResult.rows.length > 0) {
          return true;
        }

        // Verificar informes médicos
        const informesResult = await client.query(
          'SELECT id FROM informes_medicos WHERE medico_id = $1 LIMIT 1',
          [medicoId]
        );

        if (informesResult.rows.length > 0) {
          return true;
        }

        return false;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en verificarPacientesTratados:', error);
      throw error;
    }
  }

  /**
   * Marca un médico como inactivo
   */
  private async marcarMedicoComoInactivo(medicoId: number): Promise<void> {
    const client = await postgresPool.connect();
    try {
      // Iniciar transacción
      await client.query('BEGIN');

      // Marcar médico como inactivo
      await client.query(
        'UPDATE medicos SET activo = false, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1',
        [medicoId]
      );

      // Marcar usuario asociado como inactivo
      await client.query(
        'UPDATE usuarios SET activo = false WHERE medico_id = $1',
        [medicoId]
      );

      // Confirmar transacción
      await client.query('COMMIT');

      console.log(`✅ Médico ${medicoId} marcado como inactivo`);
    } catch (error) {
      // Revertir transacción en caso de error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Error al hacer rollback:', rollbackError);
      }
      console.error('Error marcando médico como inactivo:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Elimina físicamente un médico del sistema
   */
  private async eliminarMedicoFisicamente(medicoId: number): Promise<void> {
    const client = await postgresPool.connect();
    try {
      // Iniciar transacción
      await client.query('BEGIN');

      // Eliminar usuario asociado primero (por las foreign keys)
      // La tabla medicos_clinicas se eliminará automáticamente por ON DELETE CASCADE
      await client.query(
        'DELETE FROM usuarios WHERE medico_id = $1',
        [medicoId]
      );

      // Eliminar médico (esto también eliminará medicos_clinicas por CASCADE)
      await client.query(
        'DELETE FROM medicos WHERE id = $1',
        [medicoId]
      );

      // Confirmar transacción
      await client.query('COMMIT');

      console.log(`✅ Médico ${medicoId} eliminado físicamente del sistema`);
    } catch (error) {
      // Revertir transacción en caso de error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Error al hacer rollback:', rollbackError);
      }
      console.error('Error eliminando médico físicamente:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async searchMedicos(req: Request<{}, ApiResponse, {}, { q?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Search query is required' }
        };
        res.status(400).json(response);
        return;
      }

      // Escapar caracteres especiales para la búsqueda
      const searchTerm = q.trim();

      const client = await postgresPool.connect();
      try {
        let sqlQuery: string;
        const params: any[] = [];
        const searchPattern = `%${searchTerm}%`;

        // Si el término parece un email, buscar solo por email
        if (searchTerm.includes('@')) {
          sqlQuery = `
            SELECT m.*, e.nombre_especialidad
            FROM medicos m
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE m.email ILIKE $1
            ORDER BY m.nombres ASC
          `;
          params.push(searchPattern);
        } else {
          // Para otros términos, buscar en nombres, apellidos y email
          sqlQuery = `
            SELECT m.*, e.nombre_especialidad
            FROM medicos m
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE m.nombres ILIKE $1 
               OR m.apellidos ILIKE $1 
               OR m.email ILIKE $1
            ORDER BY m.nombres ASC
          `;
          params.push(searchPattern);
        }

        const result = await client.query(sqlQuery, params);

        // Combinar médicos con nombres de especialidades
        const medicosWithEspecialidad = result.rows.map(medico => ({
          ...medico,
          especialidad_nombre: medico.nombre_especialidad || 'Especialidad no encontrada'
        }));

        const response: ApiResponse = {
          success: true,
          data: medicosWithEspecialidad
        };
        res.json(response);
      } catch (dbError) {
        console.error('❌ PostgreSQL error in searchMedicos:', dbError);
        const response: ApiResponse = {
          success: false,
          error: { message: 'Error al buscar médicos' }
        };
        res.status(500).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error en searchMedicos:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getMedicosByEspecialidad(req: Request<{ especialidadId: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { especialidadId } = req.params;
      const id = parseInt(especialidadId);

      if (isNaN(id) || id <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT m.*, e.nombre_especialidad
           FROM medicos m
           LEFT JOIN especialidades e ON m.especialidad_id = e.id
           WHERE m.especialidad_id = $1
           ORDER BY m.nombres ASC`,
          [id]
        );

        const medicos = result.rows.map(medico => ({
          ...medico,
          especialidad_nombre: medico.nombre_especialidad || 'Especialidad no encontrada'
        }));

        const response: ApiResponse = {
          success: true,
          data: medicos
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }
}
