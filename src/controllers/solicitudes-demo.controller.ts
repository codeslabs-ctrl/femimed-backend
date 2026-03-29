import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import { EmailService } from '../services/email.service.js';
import { checkLimiteMedicos } from '../services/parametros-clinica.service.js';
import bcrypt from 'bcrypt';

/**
 * Solicitudes de usuario de pruebas desde el login (público, sin auth).
 * Crea un médico con rol médico y envía las credenciales por email (mismo flujo que "Crear nuevo médico").
 */
export class SolicitudesDemoController {
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { nombre, apellido, email, telefono, especialidad_id, mensaje } = req.body;
      if (!nombre || !apellido || !email || !especialidad_id) {
        res.status(400).json({
          success: false,
          error: { message: 'Nombre, apellido, email y especialidad son requeridos' }
        } as ApiResponse<null>);
        return;
      }

      const nombres = String(nombre).trim();
      const apellidos = String(apellido).trim();
      const emailTrim = String(email).trim();
      const especialidadId = Number(especialidad_id);
      const telefonoVal = telefono ? String(telefono).trim() : 'N/A';

      if (isNaN(especialidadId) || especialidadId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'Especialidad no válida' }
        } as ApiResponse<null>);
        return;
      }

      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'demomed';

      try {
        await checkLimiteMedicos();
      } catch (limitError: unknown) {
        const msg = limitError instanceof Error ? limitError.message : 'Límite de médicos alcanzado.';
        res.status(400).json({ success: false, error: { message: msg } } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();

      try {
        await client.query('BEGIN');

        // Validar que la especialidad existe
        const espResult = await client.query(
          'SELECT id FROM especialidades WHERE id = $1',
          [especialidadId]
        );
        if (espResult.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(400).json({
            success: false,
            error: { message: 'La especialidad seleccionada no existe' }
          } as ApiResponse<null>);
          return;
        }

        // Verificar si el email ya existe
        const emailCheck = await client.query(
          'SELECT id FROM medicos WHERE email = $1',
          [emailTrim]
        );
        if (emailCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          res.status(400).json({
            success: false,
            error: { message: 'El email ya está registrado en el sistema' }
          } as ApiResponse<null>);
          return;
        }

        // Insertar médico
        const medicoResult = await client.query(
          `INSERT INTO medicos (nombres, apellidos, cedula, email, telefono, especialidad_id, sexo, mpps, cm)
           VALUES ($1, $2, NULL, $3, $4, $5, NULL, NULL, NULL)
           RETURNING *`,
          [nombres, apellidos, emailTrim, telefonoVal, especialidadId]
        );
        const newMedico = medicoResult.rows[0];
        const medicoId = newMedico.id;

        // Insertar en medicos_clinicas
        await client.query(
          `INSERT INTO medicos_clinicas (medico_id, clinica_alias)
           VALUES ($1, $2)
           ON CONFLICT (medico_id, clinica_alias) DO NOTHING`,
          [medicoId, clinicaAlias]
        );

        // Usuario con OTP (mismo flujo que crear médico)
        const username = emailTrim.split('@')[0];
        if (!username) {
          await client.query('ROLLBACK');
          res.status(400).json({
            success: false,
            error: { message: 'Email inválido' }
          } as ApiResponse<null>);
          return;
        }
        const otp = Math.floor(10000000 + Math.random() * 90000000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

        await client.query(
          `INSERT INTO usuarios (username, email, password_hash, rol, medico_id, activo, verificado, first_login, password_changed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [username, emailTrim, hashedOtp, 'medico', medicoId, true, false, true, null]
        );

        // Registrar en solicitudes_demo para trazabilidad (estado completado)
        await client.query(
          `INSERT INTO solicitudes_demo (nombres, email, telefono, mensaje, estado)
           VALUES ($1, $2, $3, $4, $5)`,
          [nombres + ' ' + apellidos, emailTrim, telefonoVal !== 'N/A' ? telefonoVal : null, mensaje ? String(mensaje).trim() : null, 'completado']
        );

        await client.query('COMMIT');

        // Enviar email de bienvenida (mismo que crear nuevo médico)
        try {
          const sexoMed = (newMedico.sexo || '').toString().toLowerCase();
          const tituloMed = sexoMed === 'femenino' ? 'Dra.' : 'Dr.';
          const tituloNombre = `${tituloMed} ${nombres} ${apellidos}`.trim();
          const emailService = new EmailService();
          await emailService.sendMedicoWelcomeEmail(emailTrim, {
            nombre: `${nombres} ${apellidos}`,
            tituloNombre,
            username,
            userEmail: emailTrim,
            otp,
            expiresIn: '24 horas'
          });
        } catch (emailError) {
          console.error('SolicitudesDemoController: error enviando email:', emailError);
          // No fallar la respuesta: médico y usuario ya están creados
        }

        res.status(201).json({
          success: true,
          data: {
            message: 'Usuario de pruebas creado. Revisa tu email para las credenciales de acceso (código OTP).',
            id: newMedico.id,
            nombres: nombres + ' ' + apellidos,
            email: emailTrim
          }
        } as ApiResponse<{ message: string; id: number; nombres: string; email: string }>);
      } catch (dbError: unknown) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore
        }
        if (dbError && typeof dbError === 'object' && 'code' in dbError) {
          const err = dbError as { code: string };
          if (err.code === '23505') {
            res.status(400).json({
              success: false,
              error: { message: 'Ya existe un médico con ese email' }
            } as ApiResponse<null>);
            return;
          }
          if (err.code === '23503') {
            res.status(400).json({
              success: false,
              error: { message: 'La especialidad seleccionada no existe' }
            } as ApiResponse<null>);
            return;
          }
        }
        console.error('SolicitudesDemoController.create error:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al crear el usuario de pruebas' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('SolicitudesDemoController.create error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al registrar la solicitud' }
      } as ApiResponse<null>);
    }
  }
}
