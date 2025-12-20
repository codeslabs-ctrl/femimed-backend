import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import { EmailService } from '../services/email.service.js';

export class ConsultaController {
  // Obtener todas las consultas con filtros
  static async getConsultas(req: Request, res: Response): Promise<void> {
    try {
      const {
        paciente_id,
        medico_id,
        estado_consulta,
        fecha_desde,
        fecha_hasta,
        prioridad,
        tipo_consulta,
        search,
        page = 1,
        limit = 10
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      // Usar PostgreSQL con rawQuery para soportar filtros complejos
      const client = await postgresPool.connect();
      try {
        let sql = 'SELECT * FROM vista_consultas_completa WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;

        // Construir filtros
        if (paciente_id) {
          sql += ` AND paciente_id = $${paramIndex}`;
          params.push(paciente_id);
          paramIndex++;
        }
        if (medico_id) {
          sql += ` AND medico_id = $${paramIndex}`;
          params.push(medico_id);
          paramIndex++;
        }
        if (estado_consulta) {
          sql += ` AND estado_consulta = $${paramIndex}`;
          params.push(estado_consulta);
          paramIndex++;
        }
        if (fecha_desde) {
          sql += ` AND fecha_pautada >= $${paramIndex}`;
          params.push(fecha_desde);
          paramIndex++;
        }
        if (fecha_hasta) {
          sql += ` AND fecha_pautada <= $${paramIndex}`;
          params.push(fecha_hasta);
          paramIndex++;
        }
        if (prioridad) {
          sql += ` AND prioridad = $${paramIndex}`;
          params.push(prioridad);
          paramIndex++;
        }
        if (tipo_consulta) {
          sql += ` AND tipo_consulta = $${paramIndex}`;
          params.push(tipo_consulta);
          paramIndex++;
        }
        
        // Búsqueda de texto
        if (search && typeof search === 'string') {
          sql += ` AND (
            motivo_consulta ILIKE $${paramIndex} OR
            paciente_nombre ILIKE $${paramIndex} OR
            paciente_apellidos ILIKE $${paramIndex} OR
            medico_nombre ILIKE $${paramIndex} OR
            medico_apellidos ILIKE $${paramIndex}
          )`;
          params.push(`%${search}%`);
          paramIndex++;
        }

        // Ordenamiento
        sql += ' ORDER BY fecha_pautada DESC, hora_pautada DESC';

        // Paginación
        sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(Number(limit), offset);

        const result = await client.query(sql, params);
        const consultas = result.rows;

        res.json({
          success: true,
          data: consultas
        } as ApiResponse<typeof consultas>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consultas:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in getConsultas:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener consulta por ID
  static async getConsultaById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const consultaId = parseInt(id || '0');

      if (isNaN(consultaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de consulta inválido' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT 
            cp.*,
            p.id as paciente_id,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.cedula as paciente_cedula,
            p.telefono as paciente_telefono,
            p.email as paciente_email,
            m.id as medico_id,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
              e.id as especialidad_id,
              e.nombre_especialidad as especialidad_nombre,
              e.descripcion as especialidad_descripcion
            FROM consultas_pacientes cp
            INNER JOIN pacientes p ON cp.paciente_id = p.id
            INNER JOIN medicos m ON cp.medico_id = m.id
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE cp.id = $1`,
            [consultaId]
          );

          if (result.rows.length === 0) {
            res.status(404).json({
              success: false,
              error: { message: 'Consulta no encontrada' }
            } as ApiResponse<null>);
            return;
          }

          const row = result.rows[0];
          const consultaProcessed = {
            ...row,
            pacientes: {
              id: row.paciente_id,
              nombres: row.paciente_nombres,
              apellidos: row.paciente_apellidos,
              cedula: row.paciente_cedula,
              telefono: row.paciente_telefono,
              email: row.paciente_email
            },
            medicos: {
              id: row.medico_id,
              nombres: row.medico_nombres,
              apellidos: row.medico_apellidos,
              especialidades: row.especialidad_id ? {
                id: row.especialidad_id,
                nombre_especialidad: row.especialidad_nombre,
                descripcion: row.especialidad_descripcion
              } : null
            },
            paciente_nombre: `${row.paciente_nombres} ${row.paciente_apellidos}`,
            medico_nombre: `${row.medico_nombres} ${row.medico_apellidos}`,
            especialidad_id: row.especialidad_id || null,
            especialidad_nombre: row.especialidad_nombre || 'Sin especialidad'
          };

        res.json({
          success: true,
          data: consultaProcessed
        } as ApiResponse<typeof consultaProcessed>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener la consulta' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in getConsultaById:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener consultas por paciente
  static async getConsultasByPaciente(req: Request, res: Response): Promise<void> {
    try {
      const { pacienteId } = req.params;
      const id = parseInt(pacienteId || '0');

      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de paciente inválido' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM vista_consultas_completa WHERE paciente_id = $1 ORDER BY fecha_pautada DESC',
          [id]
        );

        res.json({
          success: true,
          data: result.rows
        } as ApiResponse<typeof result.rows>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consultas by paciente:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del paciente' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in getConsultasByPaciente:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener consultas por médico
  static async getConsultasByMedico(req: Request, res: Response): Promise<void> {
    try {
      const { medicoId } = req.params;
      const id = parseInt(medicoId || '0');

      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM vista_consultas_completa WHERE medico_id = $1 ORDER BY fecha_pautada ASC',
          [id]
        );

        res.json({
          success: true,
          data: result.rows
        } as ApiResponse<typeof result.rows>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consultas by medico:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del médico' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in getConsultasByMedico:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener consultas del día
  static async getConsultasHoy(_req: Request, res: Response): Promise<void> {
    try {
      // Obtener fecha actual en zona horaria de Venezuela (GMT-4)
      const now = new Date();
      // Crear fecha en zona horaria de Venezuela usando toLocaleDateString
      const fechaHoyVenezuela = now.toLocaleDateString('en-CA', { 
        timeZone: 'America/Caracas' 
      }); // Formato YYYY-MM-DD
      
      console.log('🔍 getConsultasHoy - Fecha filtro (Venezuela):', fechaHoyVenezuela);

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM vista_consultas_completa WHERE fecha_pautada = $1 ORDER BY hora_pautada ASC',
          [fechaHoyVenezuela]
        );

        res.json({
          success: true,
          data: result.rows
        } as ApiResponse<typeof result.rows>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consultas hoy:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del día' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in getConsultasHoy:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener consultas del día filtradas por usuario autenticado
  static async getConsultasDelDia(req: Request, res: Response): Promise<void> {
    try {
      // Obtener información del usuario autenticado desde el token
      const user = (req as any).user;
      
      console.log('🔍 getConsultasDelDia - Usuario autenticado:', {
        userId: user?.userId,
        username: user?.username,
        rol: user?.rol,
        medico_id: user?.medico_id
      });
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: { message: 'Usuario no autenticado' }
        } as ApiResponse<null>);
        return;
      }

      // Obtener fecha actual en zona horaria de Venezuela (GMT-4)
      const now = new Date();
      // Crear fecha en zona horaria de Venezuela usando toLocaleDateString
      const fechaHoyVenezuela = now.toLocaleDateString('en-CA', { 
        timeZone: 'America/Caracas' 
      }); // Formato YYYY-MM-DD
      
      console.log('🔍 Fecha actual UTC:', now.toISOString());
      console.log('🔍 Fecha actual Venezuela:', now.toLocaleString('es-VE', { timeZone: 'America/Caracas' }));
      console.log('🔍 Fecha filtro (Venezuela):', fechaHoyVenezuela);

      let consultas: any[] = [];
      let consultasProcesadas: any[] = [];

      // Usar PostgreSQL
      const client = await postgresPool.connect();
      try {
        // Construir la query SQL
        let sqlQuery = `
          SELECT c.*, 
                 p.nombres as paciente_nombre, 
                 p.apellidos as paciente_apellidos, 
                 p.telefono as paciente_telefono, 
                 p.cedula as paciente_cedula,
                 m.nombres as medico_nombre, 
                 m.apellidos as medico_apellidos,
                 m.especialidad_id,
                 e.nombre_especialidad as especialidad_nombre,
                 e.descripcion as especialidad_descripcion
          FROM consultas_pacientes c
          LEFT JOIN pacientes p ON c.paciente_id = p.id
          LEFT JOIN medicos m ON c.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          WHERE c.fecha_pautada = $1
            AND c.estado_consulta IN ('agendada', 'reagendada', 'en_progreso', 'por_agendar', 'completada')
        `;
        const params: any[] = [fechaHoyVenezuela];

        // Si el usuario es médico, filtrar solo sus consultas
        if (user.rol === 'medico' && user.medico_id) {
          console.log('🔍 Filtrando consultas por médico_id:', user.medico_id);
          sqlQuery += ' AND c.medico_id = $2';
          params.push(user.medico_id);
        } else {
          console.log('🔍 Mostrando todas las consultas (administrador o sin médico_id)');
        }

        sqlQuery += ' ORDER BY c.hora_pautada ASC';

        const result = await client.query(sqlQuery, params);
        consultas = result.rows;
        
        // Los datos ya vienen procesados con los joins
        consultasProcesadas = consultas.map(consulta => ({
          ...consulta,
          paciente_nombre: consulta.paciente_nombre || '',
          paciente_apellidos: consulta.paciente_apellidos || '',
          paciente_telefono: consulta.paciente_telefono || '',
          paciente_cedula: consulta.paciente_cedula || '',
          medico_nombre: consulta.medico_nombre || '',
          medico_apellidos: consulta.medico_apellidos || '',
          especialidad_id: consulta.especialidad_id || null,
          especialidad_nombre: consulta.especialidad_nombre || '',
          especialidad_descripcion: consulta.especialidad_descripcion || ''
        }));
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consultas del día:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del día' }
        } as ApiResponse<null>);
        return;
      } finally {
        client.release();
      }

      console.log('🔍 Consultas encontradas:', consultasProcesadas?.length || 0);
      if (consultasProcesadas && consultasProcesadas.length > 0) {
        console.log('🔍 Primera consulta:', {
          id: consultasProcesadas[0].id,
          paciente_nombre: consultasProcesadas[0].paciente_nombre,
          medico_id: consultasProcesadas[0].medico_id,
          medico_nombre: consultasProcesadas[0].medico_nombre,
          especialidad_id: consultasProcesadas[0].especialidad_id,
          especialidad_nombre: consultasProcesadas[0].especialidad_nombre
        });
      }

      res.json({
        success: true,
        data: consultasProcesadas
      } as ApiResponse<typeof consultasProcesadas>);

    } catch (error) {
      console.error('Error in getConsultasDelDia:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener consultas pendientes
  static async getConsultasPendientes(_req: Request, res: Response): Promise<void> {
    try {
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT * FROM vista_consultas_completa 
           WHERE estado_consulta IN ('agendada', 'reagendada', 'por_agendar')
           ORDER BY fecha_pautada ASC, hora_pautada ASC`
        );

        res.json({
          success: true,
          data: result.rows
        } as ApiResponse<typeof result.rows>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consultas pendientes:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas pendientes' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in getConsultasPendientes:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Crear nueva consulta
  static async createConsulta(req: Request, res: Response): Promise<void> {
    try {
      const consultaData = req.body;
      const clinicaAlias = process.env['CLINICA_ALIAS'];

      // Validar datos requeridos
      const requiredFields = ['paciente_id', 'medico_id', 'motivo_consulta', 'fecha_pautada', 'hora_pautada'];
      for (const field of requiredFields) {
        if (!consultaData[field]) {
          res.status(400).json({
            success: false,
            error: { message: `El campo ${field} es requerido` }
          } as ApiResponse<null>);
          return;
        }
      }

      // Validar que la fecha sea futura (manejo de zona horaria)
      const fechaConsulta = new Date(consultaData.fecha_pautada + 'T00:00:00.000Z'); // Forzar UTC
      const fechaActual = new Date();
      fechaActual.setUTCHours(0, 0, 0, 0); // Usar UTC para evitar problemas de zona horaria
      
      console.log('🔍 Validación de fecha:', {
        fechaRecibida: consultaData.fecha_pautada,
        fechaConsulta: fechaConsulta.toISOString(),
        fechaActual: fechaActual.toISOString(),
        esFutura: fechaConsulta >= fechaActual
      });
      
      if (fechaConsulta < fechaActual) {
        res.status(400).json({
          success: false,
          error: { message: 'La fecha de la consulta debe ser futura (posterior a hoy)' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `INSERT INTO consultas_pacientes 
           (paciente_id, medico_id, motivo_consulta, fecha_pautada, hora_pautada, 
            estado_consulta, duracion_estimada, prioridad, tipo_consulta, 
            recordatorio_enviado, clinica_alias, fecha_creacion, fecha_actualizacion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING *`,
          [
            consultaData.paciente_id,
            consultaData.medico_id,
            consultaData.motivo_consulta,
            consultaData.fecha_pautada,
            consultaData.hora_pautada,
            consultaData.estado_consulta || 'agendada',
            consultaData.duracion_estimada || 30,
            consultaData.prioridad || 'normal',
            consultaData.tipo_consulta || 'primera_vez',
            false,
            clinicaAlias
          ]
        );

        const consulta = result.rows[0];

        // Enviar emails de confirmación
        try {
          // Obtener datos del paciente y médico
          const pacienteResult = await client.query(
            'SELECT nombres, apellidos, email FROM pacientes WHERE id = $1',
            [consultaData.paciente_id]
          );
          const pacienteData = pacienteResult.rows[0];

          const medicoResult = await client.query(
            'SELECT nombres, apellidos, email FROM medicos WHERE id = $1',
            [consultaData.medico_id]
          );
          const medicoData = medicoResult.rows[0];

          if (pacienteData?.email && medicoData?.email) {
            const emailService = new EmailService();
            
            const consultaInfo = {
              pacienteNombre: `${pacienteData.nombres} ${pacienteData.apellidos}`,
              medicoNombre: `${medicoData.nombres} ${medicoData.apellidos}`,
              fecha: new Date(consultaData.fecha_pautada).toLocaleDateString('es-ES'),
              hora: consultaData.hora_pautada,
              motivo: consultaData.motivo_consulta,
              tipo: consultaData.tipo_consulta,
              duracion: consultaData.duracion_estimada
            };

            // Enviar emails en paralelo
            const emailResults = await emailService.sendConsultaConfirmation(
              pacienteData.email,
              medicoData.email,
              consultaInfo
            );

            console.log('📧 Emails enviados:', emailResults);
          }
        } catch (emailError) {
          console.error('Error enviando emails:', emailError);
          // No fallar la creación de consulta si falla el email
        }

        res.status(201).json({
          success: true,
          data: consulta
        } as ApiResponse<typeof consulta>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error creating consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al crear consulta' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in createConsulta:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Actualizar consulta
  static async updateConsulta(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const consultaId = parseInt(id || '0');
      const updateData = req.body;

      if (isNaN(consultaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de consulta inválido' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        // Construir query dinámico para UPDATE
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        Object.keys(updateData).forEach(key => {
          if (updateData[key] !== undefined) {
            setClauses.push(`${key} = $${paramIndex}`);
            values.push(updateData[key]);
            paramIndex++;
          }
        });

        if (setClauses.length === 0) {
          res.status(400).json({
            success: false,
            error: { message: 'No hay campos para actualizar' }
          } as ApiResponse<null>);
          return;
        }

        // Agregar fecha_actualizacion
        setClauses.push(`fecha_actualizacion = CURRENT_TIMESTAMP`);
        values.push(consultaId);

        const sqlQuery = `
          UPDATE consultas_pacientes
          SET ${setClauses.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
        `;

        const result = await client.query(sqlQuery, values);

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Consulta no encontrada' }
          } as ApiResponse<null>);
          return;
        }

        res.json({
          success: true,
          data: result.rows[0]
        } as ApiResponse<typeof result.rows[0]>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error updating consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al actualizar consulta' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in updateConsulta:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Cancelar consulta
  static async cancelarConsulta(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const consultaId = parseInt(id || '0');
      const { motivo_cancelacion } = req.body;

      console.log('🔍 Cancelar consulta - ID:', consultaId);
      console.log('🔍 Cancelar consulta - Motivo:', motivo_cancelacion);

      if (isNaN(consultaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de consulta inválido' }
        } as ApiResponse<null>);
        return;
      }

      if (!motivo_cancelacion) {
        res.status(400).json({
          success: false,
          error: { message: 'El motivo de cancelación es requerido' }
        } as ApiResponse<null>);
        return;
      }

      console.log('🔄 Verificando si la consulta existe...');
      
      // Obtener información del usuario autenticado
      const user = (req as any).user;
      console.log('👤 Usuario que cancela:', user);

      const client = await postgresPool.connect();
      try {
        // Verificar que la consulta existe
        const consultaCheck = await client.query(
          'SELECT id, estado_consulta FROM consultas_pacientes WHERE id = $1',
          [consultaId]
        );

        if (consultaCheck.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Consulta no encontrada' }
          } as ApiResponse<null>);
          return;
        }

        const consultaExistente = consultaCheck.rows[0];
        console.log('✅ Consulta encontrada:', consultaExistente);

        // Verificar que la consulta está en un estado válido para cancelar
        if (!['agendada', 'reagendada'].includes(consultaExistente.estado_consulta)) {
          res.status(400).json({
            success: false,
            error: { message: 'Solo se pueden cancelar consultas en estado "agendada" o "reagendada"' }
          } as ApiResponse<null>);
          return;
        }

        // Actualizar el estado de la consulta a 'cancelada'
        const updateResult = await client.query(
          `UPDATE consultas_pacientes 
           SET estado_consulta = 'cancelada',
               motivo_cancelacion = $1,
               fecha_cancelacion = CURRENT_TIMESTAMP,
               cancelado_por = $2,
               fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`,
          [motivo_cancelacion, user?.userId || null, consultaId]
        );

        const consulta = updateResult.rows[0];
        console.log('✅ Consulta cancelada exitosamente:', consulta);

        // Obtener datos completos de la consulta para el email
        const consultaCompletaResult = await client.query(
          `SELECT 
            cp.id,
            cp.motivo_consulta,
            cp.tipo_consulta,
            cp.fecha_pautada,
            cp.hora_pautada,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.email as paciente_email,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            m.email as medico_email
          FROM consultas_pacientes cp
          INNER JOIN pacientes p ON cp.paciente_id = p.id
          INNER JOIN medicos m ON cp.medico_id = m.id
          WHERE cp.id = $1`,
          [consultaId]
        );

        const consultaCompleta = consultaCompletaResult.rows[0];

        if (consultaCompleta && consultaCompleta.paciente_email && consultaCompleta.medico_email) {
          console.log('📧 Enviando emails de cancelación...');
          
          const emailService = new EmailService();
          const emailData = {
            pacienteNombre: `${consultaCompleta.paciente_nombres} ${consultaCompleta.paciente_apellidos}`,
            medicoNombre: `${consultaCompleta.medico_nombres} ${consultaCompleta.medico_apellidos}`,
            fecha: consultaCompleta.fecha_pautada,
            hora: consultaCompleta.hora_pautada,
            motivo: consultaCompleta.motivo_consulta,
            motivoCancelacion: motivo_cancelacion,
            tipo: consultaCompleta.tipo_consulta
          };

          try {
            const emailResults = await emailService.sendConsultaCancellation(
              consultaCompleta.paciente_email,
              consultaCompleta.medico_email,
              emailData
            );

            console.log('📧 Resultados de emails:', emailResults);
          } catch (emailError) {
            console.error('❌ Error enviando emails de cancelación:', emailError);
            // No fallar la operación por error de email
          }
        }
        
        res.json({
          success: true,
          data: {
            id: consultaId,
            estado_consulta: 'cancelada',
            motivo_cancelacion: motivo_cancelacion,
            fecha_cancelacion: consulta.fecha_cancelacion,
            cancelado_por: user?.userId || null
          }
        } as ApiResponse<any>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error canceling consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al cancelar consulta' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error in cancelarConsulta:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor', details: (error as Error).message }
      } as ApiResponse<null>);
    }
  }

  // Finalizar consulta
  static async finalizarConsulta(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const consultaId = parseInt(id || '0');

      if (isNaN(consultaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de consulta inválido' }
        } as ApiResponse<null>);
        return;
      }

      // Obtener información del usuario autenticado
      const user = (req as any).user;
      console.log('👤 Usuario que finaliza:', user);

      const client = await postgresPool.connect();
      try {
        // Verificar que la consulta existe
        const consultaCheck = await client.query(
          'SELECT id, estado_consulta FROM consultas_pacientes WHERE id = $1',
          [consultaId]
        );

        if (consultaCheck.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Consulta no encontrada' }
          } as ApiResponse<null>);
          return;
        }

        const consultaExistente = consultaCheck.rows[0];

        // Verificar que solo secretaria y administrador pueden finalizar
        if (user && user.rol !== 'secretaria' && user.rol !== 'administrador') {
          res.status(403).json({
            success: false,
            error: { message: 'Solo secretaria y administrador pueden finalizar consultas' }
          } as ApiResponse<null>);
          return;
        }

        // Verificar que la consulta está en un estado válido para finalizar (debe estar "completada")
        if (consultaExistente.estado_consulta !== 'completada') {
          res.status(400).json({
            success: false,
            error: { message: 'Solo se pueden finalizar consultas en estado "completada"' }
          } as ApiResponse<null>);
          return;
        }

        // Actualizar la consulta
        const updateResult = await client.query(
          `UPDATE consultas_pacientes 
           SET estado_consulta = 'finalizada',
               fecha_culminacion = CURRENT_TIMESTAMP,
               actualizado_por = $1,
               fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [user?.userId || null, consultaId]
        );

        const consulta = updateResult.rows[0];

        // Obtener datos completos de la consulta para el email
        const consultaCompletaResult = await client.query(
          `SELECT 
            cp.id,
            cp.motivo_consulta,
            cp.tipo_consulta,
            cp.fecha_pautada,
            cp.hora_pautada,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.email as paciente_email,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            m.email as medico_email
          FROM consultas_pacientes cp
          INNER JOIN pacientes p ON cp.paciente_id = p.id
          INNER JOIN medicos m ON cp.medico_id = m.id
          WHERE cp.id = $1`,
          [consultaId]
        );

        const consultaCompleta = consultaCompletaResult.rows[0];

        if (consultaCompleta && consultaCompleta.paciente_email && consultaCompleta.medico_email) {
          console.log('📧 Enviando emails de finalización...');
          
          const emailService = new EmailService();
          const emailData = {
            pacienteNombre: `${consultaCompleta.paciente_nombres} ${consultaCompleta.paciente_apellidos}`,
            medicoNombre: `${consultaCompleta.medico_nombres} ${consultaCompleta.medico_apellidos}`,
            fecha: consultaCompleta.fecha_pautada,
            hora: consultaCompleta.hora_pautada,
            motivo: consultaCompleta.motivo_consulta,
            diagnostico: '', // Ya no se usa diagnóstico preliminar
            observaciones: '', // Ya no se usa observaciones generales
            tipo: consultaCompleta.tipo_consulta
          };

          try {
            const emailResults = await emailService.sendConsultaCompletion(
              consultaCompleta.paciente_email,
              consultaCompleta.medico_email,
              emailData
            );
            
            console.log('📧 Resultados de emails de finalización:', emailResults);
          } catch (emailError) {
            console.error('❌ Error enviando emails de finalización:', emailError);
            // No fallar la operación por error de email
          }
        }

        res.json({
          success: true,
          data: consulta
        } as ApiResponse<typeof consulta>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error finalizing consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al finalizar consulta' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in finalizarConsulta:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Reagendar consulta
  static async reagendarConsulta(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const consultaId = parseInt(id || '0');
      const { fecha_pautada, hora_pautada } = req.body;

      console.log('🔄 Reagendar consulta - ID:', consultaId);
      console.log('🔄 Nueva fecha:', fecha_pautada);
      console.log('🔄 Nueva hora:', hora_pautada);

      if (isNaN(consultaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de consulta inválido' }
        } as ApiResponse<null>);
        return;
      }

      if (!fecha_pautada || !hora_pautada) {
        res.status(400).json({
          success: false,
          error: { message: 'La nueva fecha y hora son requeridas' }
        } as ApiResponse<null>);
        return;
      }

      // Obtener información del usuario autenticado
      const user = (req as any).user;
      console.log('👤 Usuario que reagenda:', user);

      const client = await postgresPool.connect();
      try {
        // Verificar que la consulta existe
        const consultaCheck = await client.query(
          'SELECT id, estado_consulta, fecha_pautada, hora_pautada, fecha_culminacion FROM consultas_pacientes WHERE id = $1',
          [consultaId]
        );

        if (consultaCheck.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Consulta no encontrada' }
          } as ApiResponse<null>);
          return;
        }

        const consultaExistente = consultaCheck.rows[0];
        console.log('✅ Consulta encontrada:', consultaExistente);

        // Verificar que la consulta está en un estado válido para reagendar
        if (!['agendada', 'reagendada', 'por_agendar'].includes(consultaExistente.estado_consulta)) {
          res.status(400).json({
            success: false,
            error: { message: 'Solo se pueden reagendar consultas en estado "agendada", "reagendada" o "por_agendar"' }
          } as ApiResponse<null>);
          return;
        }

        // Determinar nuevo estado
        const nuevoEstado = consultaExistente.estado_consulta === 'por_agendar' ? 'agendada' : 'reagendada';

        // Si la consulta ya está finalizada, limpiar datos de finalización
        let updateResult;
        if (consultaExistente.fecha_culminacion) {
          console.log('🔄 Consulta finalizada reagendada - limpiando datos de finalización');
          updateResult = await client.query(
            `UPDATE consultas_pacientes 
             SET fecha_pautada = $1,
                 hora_pautada = $2,
                 estado_consulta = $3,
                 fecha_culminacion = NULL,
                 fecha_actualizacion = CURRENT_TIMESTAMP,
                 actualizado_por = $4
             WHERE id = $5
             RETURNING *`,
            [fecha_pautada, hora_pautada, nuevoEstado, user?.userId || null, consultaId]
          );
        } else {
          updateResult = await client.query(
            `UPDATE consultas_pacientes 
             SET fecha_pautada = $1,
                 hora_pautada = $2,
                 estado_consulta = $3,
                 fecha_actualizacion = CURRENT_TIMESTAMP,
                 actualizado_por = $4
             WHERE id = $5
             RETURNING *`,
            [fecha_pautada, hora_pautada, nuevoEstado, user?.userId || null, consultaId]
          );
        }

        const consulta = updateResult.rows[0];

        console.log('✅ Consulta reagendada exitosamente:', consulta);

        // Obtener datos completos de la consulta para el email
        const consultaCompletaResult = await client.query(
          `SELECT 
            cp.id,
            cp.motivo_consulta,
            cp.tipo_consulta,
            cp.fecha_pautada,
            cp.hora_pautada,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.email as paciente_email,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            m.email as medico_email
          FROM consultas_pacientes cp
          INNER JOIN pacientes p ON cp.paciente_id = p.id
          INNER JOIN medicos m ON cp.medico_id = m.id
          WHERE cp.id = $1`,
          [consultaId]
        );

        const consultaCompleta = consultaCompletaResult.rows[0];

        if (consultaCompleta && consultaCompleta.paciente_email && consultaCompleta.medico_email) {
          console.log('📧 Enviando emails de reagendamiento...');
          
          const emailService = new EmailService();
          const emailData = {
            pacienteNombre: `${consultaCompleta.paciente_nombres} ${consultaCompleta.paciente_apellidos}`,
            medicoNombre: `${consultaCompleta.medico_nombres} ${consultaCompleta.medico_apellidos}`,
            fechaAnterior: consultaExistente.fecha_pautada,
            horaAnterior: consultaExistente.hora_pautada,
            fechaNueva: consultaCompleta.fecha_pautada,
            horaNueva: consultaCompleta.hora_pautada,
            motivo: consultaCompleta.motivo_consulta,
            tipo: consultaCompleta.tipo_consulta
          };

          try {
            const emailResults = await emailService.sendConsultaReschedule(
              consultaCompleta.paciente_email,
              consultaCompleta.medico_email,
              emailData
            );
            
            console.log('📧 Resultados de emails de reagendamiento:', emailResults);
          } catch (emailError) {
            console.error('❌ Error enviando emails de reagendamiento:', emailError);
            // No fallar la operación por error de email
          }
        }
        
        res.json({
          success: true,
          data: consulta
        } as ApiResponse<typeof consulta>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error rescheduling consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al reagendar consulta' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('❌ Error in reagendarConsulta:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor', details: (error as Error).message }
      } as ApiResponse<null>);
    }
  }

  // Eliminar consulta
  static async deleteConsulta(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const consultaId = parseInt(id || '0');

      if (isNaN(consultaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de consulta inválido' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'DELETE FROM consultas_pacientes WHERE id = $1 RETURNING id',
          [consultaId]
        );

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Consulta no encontrada' }
          } as ApiResponse<null>);
          return;
        }

        res.json({
          success: true,
          data: null
        } as ApiResponse<null>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error deleting consulta:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al eliminar consulta' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in deleteConsulta:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Buscar consultas
  static async searchConsultas(req: Request, res: Response): Promise<void> {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          error: { message: 'Query de búsqueda requerido' }
        } as ApiResponse<null>);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const searchTerm = `%${q}%`;
        const result = await client.query(
          `SELECT * FROM vista_consultas_completa 
           WHERE motivo_consulta ILIKE $1 
              OR paciente_nombre ILIKE $1 
              OR paciente_apellidos ILIKE $1 
              OR medico_nombre ILIKE $1 
              OR medico_apellidos ILIKE $1
           ORDER BY fecha_pautada DESC`,
          [searchTerm]
        );

        res.json({
          success: true,
          data: result.rows
        } as ApiResponse<typeof result.rows>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error searching consultas:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al buscar consultas' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error in searchConsultas:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener estadísticas de consultas
  static async getEstadisticasConsultas(_req: Request, res: Response): Promise<void> {
    try {
      const client = await postgresPool.connect();
      try {
        const statsResult = await client.query(`
          SELECT 
            COUNT(*) as total_consultas,
            COUNT(*) FILTER (WHERE estado_consulta = 'agendada') as agendadas,
            COUNT(*) FILTER (WHERE estado_consulta = 'reagendada') as reagendadas,
            COUNT(*) FILTER (WHERE estado_consulta = 'finalizada') as finalizadas,
            COUNT(*) FILTER (WHERE estado_consulta = 'cancelada') as canceladas,
            COUNT(*) FILTER (WHERE estado_consulta = 'por_agendar') as por_agendar,
            COUNT(*) FILTER (WHERE fecha_pautada = CURRENT_DATE) as consultas_hoy,
            COUNT(*) FILTER (WHERE fecha_pautada >= CURRENT_DATE AND estado_consulta IN ('agendada', 'reagendada')) as consultas_futuras
          FROM consultas_pacientes
        `);

        const stats = statsResult.rows[0];

        res.json({
          success: true,
          data: {
            total_consultas: parseInt(stats.total_consultas),
            agendadas: parseInt(stats.agendadas),
            reagendadas: parseInt(stats.reagendadas),
            finalizadas: parseInt(stats.finalizadas),
            canceladas: parseInt(stats.canceladas),
            por_agendar: parseInt(stats.por_agendar),
            consultas_hoy: parseInt(stats.consultas_hoy),
            consultas_futuras: parseInt(stats.consultas_futuras)
          }
        } as ApiResponse<any>);
      } catch (dbError) {
        console.error('❌ PostgreSQL error fetching consultas statistics:', dbError);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener estadísticas' }
        } as ApiResponse<null>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in getEstadisticasConsultas:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener estadísticas de consultas por estado en un período
  static async getEstadisticasPorPeriodo(req: Request, res: Response): Promise<void> {
    try {
      const { fecha_inicio, fecha_fin } = req.query;

      console.log('🔍 Obteniendo estadísticas por período:', { fecha_inicio, fecha_fin });

      const client = await postgresPool.connect();
      try {
        let sqlQuery = `
          SELECT 
            COALESCE(estado_consulta, 'sin_estado') as estado,
            COUNT(id) as total
          FROM consultas_pacientes
          WHERE 1=1
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (fecha_inicio) {
          sqlQuery += ` AND fecha_pautada >= $${paramIndex}`;
          params.push(fecha_inicio);
          paramIndex++;
        }

        if (fecha_fin) {
          sqlQuery += ` AND fecha_pautada <= $${paramIndex}`;
          params.push(fecha_fin);
          paramIndex++;
        }

        sqlQuery += ` GROUP BY COALESCE(estado_consulta, 'sin_estado') ORDER BY total DESC`;

        console.log('🔍 PostgreSQL query:', sqlQuery);
        console.log('🔍 Params:', params);

        const result = await client.query(sqlQuery, params);

        const resultado = result.rows.map((row: any) => ({
          estado: row.estado,
          total: parseInt(row.total)
        }));

        console.log('✅ Estadísticas por período:', resultado);

        const response: ApiResponse = {
          success: true,
          data: resultado
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas por período:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  // Obtener estadísticas de consultas por especialidad en un período
  static async getEstadisticasPorEspecialidad(req: Request, res: Response): Promise<void> {
    try {
      const { fecha_inicio, fecha_fin } = req.query;

      console.log('🔍 Obteniendo estadísticas por especialidad:', { fecha_inicio, fecha_fin });

      const client = await postgresPool.connect();
      try {
        let sqlQuery = `
          SELECT 
            COALESCE(e.nombre_especialidad, 'Sin especialidad') as especialidad,
            COUNT(c.id) as total
          FROM consultas_pacientes c
          LEFT JOIN medicos m ON c.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          WHERE 1=1
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (fecha_inicio) {
          sqlQuery += ` AND c.fecha_pautada >= $${paramIndex}`;
          params.push(fecha_inicio);
          paramIndex++;
        }

        if (fecha_fin) {
          sqlQuery += ` AND c.fecha_pautada <= $${paramIndex}`;
          params.push(fecha_fin);
          paramIndex++;
        }

        sqlQuery += ` GROUP BY e.nombre_especialidad ORDER BY total DESC`;

        console.log('🔍 PostgreSQL query:', sqlQuery);
        console.log('🔍 Params:', params);

        const result = await client.query(sqlQuery, params);

        const resultado = result.rows.map((row: any) => ({
          especialidad: row.especialidad,
          total: parseInt(row.total)
        }));

        console.log('✅ Estadísticas por especialidad:', resultado);

        const response: ApiResponse = {
          success: true,
          data: resultado
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas por especialidad:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  // Obtener estadísticas de consultas por médico en un período
  static async getEstadisticasPorMedico(req: Request, res: Response): Promise<void> {
    try {
      const { fecha_inicio, fecha_fin } = req.query;

      console.log('🔍 Obteniendo estadísticas por médico:', { fecha_inicio, fecha_fin });

      const client = await postgresPool.connect();
      try {
        let sqlQuery = `
          SELECT 
            CONCAT(m.nombres, ' ', m.apellidos) as medico,
            COUNT(c.id) as total
          FROM consultas_pacientes c
          INNER JOIN medicos m ON c.medico_id = m.id
          WHERE 1=1
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (fecha_inicio) {
          sqlQuery += ` AND c.fecha_pautada >= $${paramIndex}`;
          params.push(fecha_inicio);
          paramIndex++;
        }

        if (fecha_fin) {
          sqlQuery += ` AND c.fecha_pautada <= $${paramIndex}`;
          params.push(fecha_fin);
          paramIndex++;
        }

        sqlQuery += ` GROUP BY m.id, m.nombres, m.apellidos ORDER BY total DESC`;

          console.log('🔍 PostgreSQL query:', sqlQuery);
          console.log('🔍 Params:', params);

          const result = await client.query(sqlQuery, params);

          const resultado = result.rows.map((row: any) => ({
            medico: row.medico,
            total: parseInt(row.total)
          }));

          console.log('✅ Estadísticas por médico:', resultado);

          const response: ApiResponse = {
            success: true,
            data: resultado
          };
          res.json(response);
        } finally {
          client.release();
        }
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas por médico:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }
}
