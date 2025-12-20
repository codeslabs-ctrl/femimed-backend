import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { EmailService } from '../services/email.service.js';
import { config } from '../config/environment.js';

export class MensajeController {
  // Obtener todos los mensajes
  static async getMensajes(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, estado, tipo } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const client = await postgresPool.connect();
      try {
        let sqlQuery = `
          SELECT *
          FROM mensajes_difusion
          WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIndex = 1;

        if (estado) {
          sqlQuery += ` AND estado = $${paramIndex}`;
          params.push(estado);
          paramIndex++;
        }

        if (tipo) {
          sqlQuery += ` AND tipo_mensaje = $${paramIndex}`;
          params.push(tipo);
          paramIndex++;
        }

        sqlQuery += ` ORDER BY fecha_creacion DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(Number(limit), offset);

        const result = await client.query(sqlQuery, params);

        res.json({
          success: true,
          data: result.rows
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting mensajes:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener mensaje por ID
  static async getMensajeById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM mensajes_difusion WHERE id = $1',
          [parseInt(id)]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Mensaje no encontrado' }
          });
          return;
        }

        res.json({
          success: true,
          data: result.rows[0]
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting mensaje:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Crear mensaje
  static async crearMensaje(req: Request, res: Response): Promise<void> {
    try {
      const { titulo, contenido, tipo_mensaje, fecha_programado, destinatarios } = req.body;

      if (!titulo || !contenido || !destinatarios || !Array.isArray(destinatarios)) {
        res.status(400).json({
          success: false,
          error: { message: 'Datos requeridos: titulo, contenido, destinatarios' }
        });
        return;
      }

      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'demomed';
      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Crear el mensaje
        const mensajeResult = await client.query(
          `INSERT INTO mensajes_difusion (
            titulo, contenido, tipo_mensaje, estado, fecha_programado,
            creado_por, total_destinatarios, clinica_alias
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            titulo,
            contenido,
            tipo_mensaje || 'general',
            fecha_programado ? 'programado' : 'borrador',
            fecha_programado || null,
            1, // TODO: Obtener del token JWT
            destinatarios.length,
            clinicaAlias
          ]
        );

        const mensaje = mensajeResult.rows[0];

        // Obtener emails de los pacientes seleccionados
        const pacientesResult = await client.query(
          'SELECT id, email FROM pacientes WHERE id = ANY($1::int[])',
          [destinatarios]
        );

        if (pacientesResult.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(400).json({
            success: false,
            error: { message: 'No se encontraron pacientes con los IDs proporcionados' }
          });
          return;
        }

        // Crear destinatarios
        const destinatariosData = pacientesResult.rows
          .filter((paciente: any) => paciente.id && paciente.email)
          .map((paciente: any) => ({
            mensaje_id: mensaje.id,
            paciente_id: paciente.id,
            email: paciente.email,
            estado_envio: 'pendiente'
          }));

        for (const dest of destinatariosData) {
          await client.query(
            `INSERT INTO mensajes_destinatarios (mensaje_id, paciente_id, email, estado_envio)
             VALUES ($1, $2, $3, $4)`,
            [dest.mensaje_id, dest.paciente_id, dest.email, dest.estado_envio]
          );
        }

        await client.query('COMMIT');

        res.json({
          success: true,
          data: mensaje
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating mensaje:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al crear el mensaje' }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error creating mensaje:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Actualizar mensaje
  static async actualizarMensaje(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }
      const { titulo, contenido, tipo_mensaje, fecha_programado } = req.body;

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `UPDATE mensajes_difusion
           SET titulo = $1, contenido = $2, tipo_mensaje = $3, fecha_programado = $4,
               estado = $5, fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id = $6
           RETURNING *`,
          [
            titulo ?? '',
            contenido ?? '',
            tipo_mensaje ?? '',
            fecha_programado ?? null,
            fecha_programado ? 'programado' : 'borrador',
            parseInt(id)
          ]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Mensaje no encontrado' }
          });
          return;
        }

        res.json({
          success: true,
          data: result.rows[0]
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error updating mensaje:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Eliminar mensaje
  static async eliminarMensaje(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }

      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Eliminar destinatarios primero (por foreign key)
        await client.query(
          'DELETE FROM mensajes_destinatarios WHERE mensaje_id = $1',
          [parseInt(id)]
        );

        // Eliminar mensaje
        const result = await client.query(
          'DELETE FROM mensajes_difusion WHERE id = $1 RETURNING id',
          [parseInt(id)]
        );

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({
            success: false,
            error: { message: 'Mensaje no encontrado' }
          });
          return;
        }

        await client.query('COMMIT');

        res.json({
          success: true
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error deleting mensaje:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al eliminar el mensaje' }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deleting mensaje:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener pacientes para difusión
  static async getPacientesParaDifusion(req: Request, res: Response): Promise<void> {
    try {
      const { busqueda, activos } = req.query;

      const client = await postgresPool.connect();
      try {
        let sqlQuery = `
          SELECT 
            id,
            nombres,
            apellidos,
            email,
            telefono,
            edad,
            sexo,
            activo,
            fecha_creacion,
            cedula
          FROM pacientes
          WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIndex = 1;

        if (busqueda) {
          sqlQuery += ` AND (nombres ILIKE $${paramIndex} OR apellidos ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
          params.push(`%${busqueda}%`);
          paramIndex++;
        }

        // Filtro por activos
        if (activos === 'true') {
          sqlQuery += ` AND activo = true`;
        } else if (activos === 'false') {
          sqlQuery += ` AND activo = false`;
        }
        // Si no se especifica 'activos', mostrar todos (activos e inactivos)

        sqlQuery += ` ORDER BY nombres ASC`;

        const result = await client.query(sqlQuery, params);
        const pacientes = result.rows;

        // Transformar datos para el frontend
        const pacientesTransformados = pacientes?.map((paciente: any) => ({
        id: paciente.id ?? 0,
        nombres: paciente.nombres ?? '',
        apellidos: paciente.apellidos ?? '',
        email: paciente.email ?? '',
        telefono: paciente.telefono ?? '',
        edad: paciente.edad ?? 0,
        sexo: paciente.sexo ?? '',
        activo: paciente.activo,
        cedula: paciente.cedula,
          medico_nombre: 'Sin médico asignado',
          especialidad_nombre: 'Sin especialidad',
          seleccionado: false
        })) || [];

        res.json({
          success: true,
          data: pacientesTransformados
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting pacientes:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Enviar mensaje
  static async enviarMensaje(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }
      const client = await postgresPool.connect();
      
      try {
        // 1. Obtener el mensaje completo
        const mensajeResult = await client.query(
          'SELECT * FROM mensajes_difusion WHERE id = $1',
          [parseInt(id)]
        );

        if (mensajeResult.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Mensaje no encontrado' }
          });
          return;
        }

        const mensaje = mensajeResult.rows[0];

        // 2. Obtener todos los destinatarios con sus emails
        const destinatariosResult = await client.query(
          `SELECT 
            md.id,
            md.paciente_id,
            md.email,
            md.estado_envio,
            p.nombres,
            p.apellidos,
            p.email as paciente_email
          FROM mensajes_destinatarios md
          LEFT JOIN pacientes p ON md.paciente_id = p.id
          WHERE md.mensaje_id = $1`,
          [parseInt(id)]
        );

        if (destinatariosResult.rows.length === 0) {
          res.status(400).json({
            success: false,
            error: { message: 'No hay destinatarios para este mensaje' }
          });
          return;
        }

        const destinatarios = destinatariosResult.rows;

        // 3. Inicializar EmailService
        const emailService = new EmailService();
        let enviados = 0;
        let fallidos = 0;

        // 4. Enviar email a cada destinatario
        for (const destinatario of destinatarios) {
          if (!destinatario.id) {
            continue; // Skip destinatarios sin id
          }
          const email = destinatario.email || destinatario.paciente_email;
          
          if (!email) {
            console.warn(`⚠️ Destinatario ${destinatario.paciente_id} no tiene email`);
            // Actualizar como fallido
            await client.query(
              `UPDATE mensajes_destinatarios
               SET estado_envio = 'fallido', error_envio = 'Email no disponible'
               WHERE id = $1`,
              [destinatario.id]
            );
            fallidos++;
            continue;
          }

          // Preparar plantilla del mensaje de difusión
          const emailTemplate = {
            subject: mensaje.titulo,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 30px 20px; text-align: center; }
                  .content { padding: 20px; background: #f9f9f9; }
                  .message-body { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
                  .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>📧 ${config.sistema.clinicaNombre}</h1>
                    <h2>${mensaje.titulo}</h2>
                  </div>
                  <div class="content">
                    <p>Estimado/a <strong>${destinatario.nombres || ''} ${destinatario.apellidos || ''}</strong>,</p>
                    <div class="message-body">
                      ${mensaje.contenido}
                    </div>
                    <p>Saludos cordiales,<br>Equipo ${config.sistema.clinicaNombre}</p>
                  </div>
                  <div class="footer">
                    <p>${config.sistema.clinicaNombre}</p>
                    <p>Este es un mensaje automático, por favor no responder a este email.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
            text: mensaje.contenido.replace(/<[^>]*>/g, '') // Versión texto plano
          };

          // Enviar email
          const resultadoEnvio = await emailService.sendTemplateEmail(
            email,
            emailTemplate,
            {
              pacienteNombre: destinatario.nombres || '',
              pacienteApellidos: destinatario.apellidos || ''
            }
          );

          // Actualizar estado del destinatario
          await client.query(
            `UPDATE mensajes_destinatarios
             SET estado_envio = $1, fecha_envio = $2, error_envio = $3
             WHERE id = $4`,
            [
              resultadoEnvio ? 'enviado' : 'fallido',
              resultadoEnvio ? new Date() : null,
              resultadoEnvio ? null : 'Error al enviar email',
              destinatario.id
            ]
          );

          if (resultadoEnvio) {
            enviados++;
            console.log(`✅ Email enviado exitosamente a ${email}`);
          } else {
            fallidos++;
            console.error(`❌ Error enviando email a ${email}`);
          }
        }

        // 5. Actualizar estado del mensaje
        await client.query(
          `UPDATE mensajes_difusion
           SET estado = 'enviado', fecha_envio = CURRENT_TIMESTAMP,
               total_enviados = $1, total_fallidos = $2
           WHERE id = $3`,
          [enviados, fallidos, parseInt(id)]
        );

        res.json({
          success: true,
          data: {
            mensaje_id: id,
            total_destinatarios: destinatarios.length,
            enviados,
            fallidos,
            mensaje: enviados > 0 
              ? `Mensaje enviado a ${enviados} destinatario${enviados !== 1 ? 's' : ''}`
              : 'Error: No se pudo enviar el mensaje a ningún destinatario'
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error sending mensaje:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Programar mensaje
  static async programarMensaje(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }
      const { fecha_programado } = req.body;

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `UPDATE mensajes_difusion
           SET estado = 'programado', fecha_programado = $1, fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING id`,
          [fecha_programado, parseInt(id)]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Mensaje no encontrado' }
          });
          return;
        }

        res.json({
          success: true
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error scheduling mensaje:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener destinatarios
  static async getDestinatarios(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT 
            md.*,
            p.nombres,
            p.apellidos,
            p.email as paciente_email
          FROM mensajes_destinatarios md
          LEFT JOIN pacientes p ON md.paciente_id = p.id
          WHERE md.mensaje_id = $1`,
          [parseInt(id)]
        );

        res.json({
          success: true,
          data: result.rows || []
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting destinatarios:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener destinatarios actuales con información completa del paciente
  static async getDestinatariosActuales(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT 
            md.id,
            md.paciente_id,
            md.estado_envio,
            p.id as paciente_id_full,
            p.nombres,
            p.apellidos,
            p.email,
            p.telefono,
            p.edad,
            p.sexo,
            p.activo,
            p.cedula
          FROM mensajes_destinatarios md
          LEFT JOIN pacientes p ON md.paciente_id = p.id
          WHERE md.mensaje_id = $1`,
          [parseInt(id)]
        );

        // Transformar datos para el frontend
        const destinatariosTransformados = result.rows.map(dest => ({
          id: dest.paciente_id_full,
          nombres: dest.nombres,
          apellidos: dest.apellidos,
          email: dest.email,
          telefono: dest.telefono,
          edad: dest.edad,
          sexo: dest.sexo,
          activo: dest.activo,
          cedula: dest.cedula,
          estado_envio: dest.estado_envio,
          seleccionado: true // Ya están seleccionados
        }));

        res.json({
          success: true,
          data: destinatariosTransformados
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting destinatarios actuales:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Agregar nuevos destinatarios a un mensaje
  static async agregarDestinatarios(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }
      const { destinatarios } = req.body; // Array de IDs de pacientes

      if (!destinatarios || !Array.isArray(destinatarios)) {
        res.status(400).json({
          success: false,
          error: { message: 'Se requiere un array de IDs de destinatarios' }
        });
        return;
      }

      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Obtener emails de los pacientes
        const pacientesResult = await client.query(
          'SELECT id, email FROM pacientes WHERE id = ANY($1::int[])',
          [destinatarios]
        );

        if (pacientesResult.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(400).json({
            success: false,
            error: { message: 'No se encontraron pacientes con los IDs proporcionados' }
          });
          return;
        }

        // Crear destinatarios
        for (const paciente of pacientesResult.rows) {
          if (!paciente.id || !paciente.email) {
            continue; // Skip pacientes sin id o email
          }
          await client.query(
            `INSERT INTO mensajes_destinatarios (mensaje_id, paciente_id, email, estado_envio)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [parseInt(id), paciente.id, paciente.email, 'pendiente']
          );
        }

        // Actualizar total_destinatarios en la tabla mensajes
        const countResult = await client.query(
          'SELECT COUNT(*) as count FROM mensajes_destinatarios WHERE mensaje_id = $1',
          [parseInt(id)]
        );

        const destinatariosCount = parseInt(countResult.rows[0].count);
        console.log('Destinatarios count:', destinatariosCount, 'for mensaje:', id);

        await client.query(
          'UPDATE mensajes_difusion SET total_destinatarios = $1 WHERE id = $2',
          [destinatariosCount, parseInt(id)]
        );

        await client.query('COMMIT');

        console.log('Successfully updated total_destinatarios to:', destinatariosCount);

        res.json({
          success: true,
          data: { message: 'Destinatarios agregados exitosamente' }
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error adding destinatarios:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al agregar los destinatarios' }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error adding destinatarios:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Eliminar destinatario de un mensaje
  static async eliminarDestinatario(req: Request, res: Response): Promise<void> {
    try {
      const { id, pacienteId } = req.params;
      if (!id || !pacienteId) {
        res.status(400).json({
          success: false,
          error: { message: 'ID and pacienteId are required' }
        });
        return;
      }

      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Eliminar destinatario
        const deleteResult = await client.query(
          'DELETE FROM mensajes_destinatarios WHERE mensaje_id = $1 AND paciente_id = $2 RETURNING id',
          [parseInt(id), parseInt(pacienteId)]
        );

        if (deleteResult.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({
            success: false,
            error: { message: 'Destinatario no encontrado' }
          });
          return;
        }

        // Actualizar total_destinatarios en la tabla mensajes
        const countResult = await client.query(
          'SELECT COUNT(*) as count FROM mensajes_destinatarios WHERE mensaje_id = $1',
          [parseInt(id)]
        );

        const destinatariosCount = parseInt(countResult.rows[0].count);

        await client.query(
          'UPDATE mensajes_difusion SET total_destinatarios = $1 WHERE id = $2',
          [destinatariosCount, parseInt(id)]
        );

        await client.query('COMMIT');

        res.json({
          success: true,
          data: { message: 'Destinatario eliminado exitosamente' }
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error deleting destinatario:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al eliminar el destinatario' }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deleting destinatario:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Diagnosticar destinatarios de un mensaje específico
  static async diagnosticarDestinatarios(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }
      
      const client = await postgresPool.connect();
      try {
        // Obtener mensaje
        const mensajeResult = await client.query(
          'SELECT id, titulo, total_destinatarios FROM mensajes_difusion WHERE id = $1',
          [parseInt(id)]
        );

        if (mensajeResult.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Mensaje no encontrado' }
          });
          return;
        }

        const mensaje = mensajeResult.rows[0];

        // Contar destinatarios reales
        const countResult = await client.query(
          'SELECT COUNT(*) as count FROM mensajes_destinatarios WHERE mensaje_id = $1',
          [parseInt(id)]
        );

        const destinatariosReales = parseInt(countResult.rows[0].count);

        // Obtener lista de destinatarios
        const listaResult = await client.query(
          'SELECT id, paciente_id, estado_envio FROM mensajes_destinatarios WHERE mensaje_id = $1',
          [parseInt(id)]
        );

        res.json({
          success: true,
          data: {
            mensaje: mensaje,
            contador_actual: mensaje.total_destinatarios,
            destinatarios_reales: destinatariosReales,
            destinatarios_lista: listaResult.rows || [],
            sincronizado: mensaje.total_destinatarios === destinatariosReales
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error diagnosing destinatarios:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Sincronizar contadores de destinatarios
  static async sincronizarContadores(_req: Request, res: Response): Promise<void> {
    try {
      const client = await postgresPool.connect();
      try {
        // Obtener todos los mensajes
        const mensajesResult = await client.query('SELECT id FROM mensajes_difusion');

        // Para cada mensaje, contar destinatarios y actualizar
        for (const mensaje of mensajesResult.rows) {
          const countResult = await client.query(
            'SELECT COUNT(*) as count FROM mensajes_destinatarios WHERE mensaje_id = $1',
            [mensaje.id]
          );

          const destinatariosCount = parseInt(countResult.rows[0].count);

          await client.query(
            'UPDATE mensajes_difusion SET total_destinatarios = $1 WHERE id = $2',
            [destinatariosCount, mensaje.id]
          );
          
          console.log(`Updated mensaje ${mensaje.id} with ${destinatariosCount} destinatarios`);
        }

        res.json({
          success: true,
          data: { message: 'Contadores sincronizados exitosamente' }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error syncing counters:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener estadísticas
  static async getEstadisticas(_req: Request, res: Response): Promise<void> {
    try {
      const client = await postgresPool.connect();
      try {
        // Obtener estadísticas básicas
        const result = await client.query(
          'SELECT estado, total_destinatarios, total_enviados, total_fallidos FROM mensajes_difusion'
        );

        const mensajes = result.rows;

        const estadisticas = {
          total_mensajes: mensajes.length || 0,
          mensajes_enviados: mensajes.filter(m => m.estado === 'enviado').length || 0,
          mensajes_programados: mensajes.filter(m => m.estado === 'programado').length || 0,
          mensajes_borrador: mensajes.filter(m => m.estado === 'borrador').length || 0,
          total_destinatarios: mensajes.reduce((sum, m) => sum + (m.total_destinatarios || 0), 0) || 0,
          tasa_entrega: 0 // TODO: Calcular basado en total_enviados vs total_destinatarios
        };

        res.json({
          success: true,
          data: estadisticas
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting estadisticas:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Duplicar mensaje
  static async duplicarMensaje(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID is required' }
        });
        return;
      }

      const client = await postgresPool.connect();
      try {
        // Obtener mensaje original
        const originalResult = await client.query(
          'SELECT * FROM mensajes_difusion WHERE id = $1',
          [parseInt(id)]
        );

        if (originalResult.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Mensaje no encontrado' }
          });
          return;
        }

        const mensajeOriginal = originalResult.rows[0];

        // Crear copia
        const copyResult = await client.query(
          `INSERT INTO mensajes_difusion (
            titulo, contenido, tipo_mensaje, estado, creado_por, clinica_alias
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            `${mensajeOriginal.titulo} (Copia)`,
            mensajeOriginal.contenido,
            mensajeOriginal.tipo_mensaje,
            'borrador',
            mensajeOriginal.creado_por,
            mensajeOriginal.clinica_alias || process.env['CLINICA_ALIAS'] || 'demomed'
          ]
        );

        res.json({
          success: true,
          data: copyResult.rows[0]
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error duplicating mensaje:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }
}
