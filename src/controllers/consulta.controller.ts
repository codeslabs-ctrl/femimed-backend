import { Request, Response } from 'express';
import { supabase } from '../config/database.js';
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

      let query = supabase
        .from('vista_consultas_completa')
        .select('*')
        .range(offset, offset + Number(limit) - 1)
        .order('fecha_pautada', { ascending: false })
        .order('hora_pautada', { ascending: false });

      // Aplicar filtros
      if (paciente_id) {
        query = query.eq('paciente_id', paciente_id);
      }
      if (medico_id) {
        query = query.eq('medico_id', medico_id);
      }
      if (estado_consulta) {
        query = query.eq('estado_consulta', estado_consulta);
      }
      if (fecha_desde) {
        query = query.gte('fecha_pautada', fecha_desde);
      }
      if (fecha_hasta) {
        query = query.lte('fecha_pautada', fecha_hasta);
      }
      if (prioridad) {
        query = query.eq('prioridad', prioridad);
      }
      if (tipo_consulta) {
        query = query.eq('tipo_consulta', tipo_consulta);
      }
      
      // Aplicar búsqueda de texto
      if (search && typeof search === 'string') {
        query = query.or(`motivo_consulta.ilike.%${search}%,paciente_nombre.ilike.%${search}%,paciente_apellidos.ilike.%${search}%,medico_nombre.ilike.%${search}%,medico_apellidos.ilike.%${search}%`);
      }

      const { data: consultas, error } = await query;

      if (error) {
        console.error('Error fetching consultas:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: consultas || []
      } as ApiResponse<typeof consultas>);

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

      // Primero obtener la consulta básica
      const { data: consulta, error: consultaError } = await supabase
        .from('consultas_pacientes')
        .select(`
          *,
          pacientes!inner(
            id,
            nombres,
            apellidos,
            cedula,
            telefono,
            email
          ),
          medicos!fk_consultas_medico(
            id,
            nombres,
            apellidos,
            especialidades(
              id,
              nombre_especialidad,
              descripcion
            )
          )
        `)
        .eq('id', consultaId)
        .single();

      if (consultaError) {
        console.error('Error fetching consulta:', consultaError);
        res.status(404).json({
          success: false,
          error: { message: 'Consulta no encontrada' }
        } as ApiResponse<null>);
        return;
      }

      // Procesar los datos para incluir especialidad_id
      console.log('🔍 Datos de consulta desde BD:', JSON.stringify(consulta, null, 2));
      console.log('🔍 Médico completo:', consulta.medicos);
      console.log('🔍 Especialidad del médico:', consulta.medicos.especialidades);
      console.log('🔍 Tipo de especialidades:', typeof consulta.medicos.especialidades);
      console.log('🔍 Es array especialidades:', Array.isArray(consulta.medicos.especialidades));
      
      // Manejar especialidades como array
      const especialidad = Array.isArray(consulta.medicos.especialidades) 
        ? consulta.medicos.especialidades[0] 
        : consulta.medicos.especialidades;
      
      console.log('🔍 Especialidad procesada:', especialidad);
      console.log('🔍 Especialidad ID:', especialidad?.id);
      console.log('🔍 Especialidad nombre:', especialidad?.nombre_especialidad);
      
      const consultaProcessed = {
        ...consulta,
        paciente_nombre: `${consulta.pacientes.nombres} ${consulta.pacientes.apellidos}`,
        medico_nombre: `${consulta.medicos.nombres} ${consulta.medicos.apellidos}`,
        especialidad_id: especialidad?.id || null,
        especialidad_nombre: especialidad?.nombre_especialidad || 'Sin especialidad'
      };
      
      console.log('🔍 Consulta procesada:', JSON.stringify(consultaProcessed, null, 2));

      res.json({
        success: true,
        data: consultaProcessed
      } as ApiResponse<typeof consultaProcessed>);

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

      const { data: consultas, error } = await supabase
        .from('vista_consultas_completa')
        .select('*')
        .eq('paciente_id', id)
        .order('fecha_pautada', { ascending: false });

      if (error) {
        console.error('Error fetching consultas by paciente:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del paciente' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: consultas || []
      } as ApiResponse<typeof consultas>);

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

      const { data: consultas, error } = await supabase
        .from('vista_consultas_completa')
        .select('*')
        .eq('medico_id', id)
        .order('fecha_pautada', { ascending: true });

      if (error) {
        console.error('Error fetching consultas by medico:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del médico' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: consultas || []
      } as ApiResponse<typeof consultas>);

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

      const { data: consultas, error } = await supabase
        .from('vista_consultas_hoy')
        .select('*')
        .eq('fecha_pautada', fechaHoyVenezuela);

      if (error) {
        console.error('Error fetching consultas hoy:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del día' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: consultas || []
      } as ApiResponse<typeof consultas>);

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

      // Consulta simple sin joins complejos
      let query = supabase
        .from('consultas_pacientes')
        .select('*')
        .eq('fecha_pautada', fechaHoyVenezuela)
        .in('estado_consulta', ['agendada', 'reagendada', 'en_progreso', 'por_agendar', 'completada'])
        .order('hora_pautada', { ascending: true });

      // Si el usuario es médico, filtrar solo sus consultas
      if (user.rol === 'medico' && user.medico_id) {
        console.log('🔍 Filtrando consultas por médico_id:', user.medico_id);
        query = query.eq('medico_id', user.medico_id);
      } else if (user.rol === 'administrador' || user.rol === 'secretaria') {
        // Administrador y secretaria ven todas las consultas (incluyendo completadas)
        console.log('🔍 Mostrando todas las consultas para', user.rol, '(incluyendo completadas)');
      } else {
        console.log('🔍 Mostrando todas las consultas (sin médico_id)');
      }

      const { data: consultas, error } = await query;

      if (error) {
        console.error('Error fetching consultas del día:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas del día' }
        } as ApiResponse<null>);
        return;
      }

      // Procesar datos con consultas separadas
      const consultasProcesadas = [];
      
      for (const consulta of consultas || []) {
        // Obtener datos del paciente
        const { data: paciente } = await supabase
          .from('pacientes')
          .select('nombres, apellidos, telefono, cedula')
          .eq('id', consulta.paciente_id)
          .single();
        
        // Obtener datos del médico con especialidad
        const { data: medico } = await supabase
          .from('medicos')
          .select(`
            nombres,
            apellidos,
            especialidad_id,
            especialidades!inner(
              nombre_especialidad,
              descripcion
            )
          `)
          .eq('id', consulta.medico_id)
          .single();
        
        // Combinar datos
        consultasProcesadas.push({
          ...consulta,
          paciente_nombre: paciente?.nombres || '',
          paciente_apellidos: paciente?.apellidos || '',
          paciente_telefono: paciente?.telefono || '',
          paciente_cedula: paciente?.cedula || '',
          medico_nombre: medico?.nombres || '',
          medico_apellidos: medico?.apellidos || '',
          especialidad_id: medico?.especialidad_id || null,
          especialidad_nombre: medico?.especialidades?.[0]?.nombre_especialidad || '',
          especialidad_descripcion: medico?.especialidades?.[0]?.descripcion || ''
        });
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
      const { data: consultas, error } = await supabase
        .from('vista_consultas_pendientes')
        .select('*');

      if (error) {
        console.error('Error fetching consultas pendientes:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener consultas pendientes' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: consultas || []
      } as ApiResponse<typeof consultas>);

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
      console.log('📥 [BACKEND] createConsulta - Datos recibidos:', {
        paciente_id: req.body.paciente_id,
        medico_id: req.body.medico_id,
        fecha_pautada: req.body.fecha_pautada,
        hora_pautada: req.body.hora_pautada,
        motivo_consulta: req.body.motivo_consulta,
        tipo_consulta: req.body.tipo_consulta,
        prioridad: req.body.prioridad,
        datosCompletos: req.body
      });
      
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

      // Validar que la fecha sea hoy o futura usando zona horaria de Venezuela (America/Caracas)
      // La fecha viene en formato YYYY-MM-DD
      const fechaConsultaStr = consultaData.fecha_pautada; // Formato: YYYY-MM-DD
      
      console.log('📅 [BACKEND] Validación de fecha - Inicio:', {
        fechaConsultaStr,
        tipo: typeof fechaConsultaStr,
        valorOriginal: consultaData.fecha_pautada
      });
      
      // Obtener fecha actual en zona horaria de Venezuela
      const now = new Date();
      const fechaHoyVenezuela = now.toLocaleDateString('en-CA', { 
        timeZone: 'America/Caracas' 
      }); // Formato YYYY-MM-DD
      
      console.log('📅 [BACKEND] Fechas obtenidas:', {
        fechaConsultaStr,
        fechaHoyVenezuela,
        fechaActualUTC: now.toISOString(),
        fechaActualVenezuela: now.toLocaleString('es-VE', { timeZone: 'America/Caracas' }),
        timestampUTC: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneObjetivo: 'America/Caracas'
      });
      
      // Comparar fechas en formato YYYY-MM-DD (solo fecha, sin hora)
      const esValida = fechaConsultaStr >= fechaHoyVenezuela;
      const comparacion = fechaConsultaStr < fechaHoyVenezuela ? 'MENOR (INVÁLIDA)' : 'MAYOR O IGUAL (VÁLIDA)';
      
      console.log('📅 [BACKEND] Comparación de fechas:', {
        fechaConsulta: fechaConsultaStr,
        fechaHoy: fechaHoyVenezuela,
        comparacion,
        esValida,
        resultadoComparacion: fechaConsultaStr < fechaHoyVenezuela ? 'RECHAZAR' : 'ACEPTAR'
      });
      
      // Permitir fecha de hoy o futura (comparación de strings YYYY-MM-DD funciona correctamente)
      if (fechaConsultaStr < fechaHoyVenezuela) {
        console.error('❌ [BACKEND] Fecha rechazada - Es pasada:', {
          fechaConsulta: fechaConsultaStr,
          fechaHoy: fechaHoyVenezuela,
          diferencia: fechaConsultaStr < fechaHoyVenezuela,
          mensajeError: 'La fecha de la consulta debe ser hoy o una fecha futura. No se pueden programar consultas en fechas pasadas.'
        });
        
        res.status(400).json({
          success: false,
          error: { message: 'La fecha de la consulta debe ser hoy o una fecha futura. No se pueden programar consultas en fechas pasadas.' }
        } as ApiResponse<null>);
        return;
      }
      
      console.log('✅ [BACKEND] Fecha validada correctamente, procediendo a crear consulta...');

      console.log('💾 [BACKEND] Insertando consulta en base de datos:', {
        paciente_id: consultaData.paciente_id,
        medico_id: consultaData.medico_id,
        fecha_pautada: consultaData.fecha_pautada,
        hora_pautada: consultaData.hora_pautada,
        estado_consulta: consultaData.estado_consulta || 'agendada',
        duracion_estimada: consultaData.duracion_estimada || 30,
        prioridad: consultaData.prioridad || 'normal',
        tipo_consulta: consultaData.tipo_consulta || 'primera_vez',
        clinica_alias: clinicaAlias
      });
      
      const { data: consulta, error } = await supabase
        .from('consultas_pacientes')
        .insert([{
          ...consultaData,
          estado_consulta: consultaData.estado_consulta || 'agendada',
          duracion_estimada: consultaData.duracion_estimada || 30,
          prioridad: consultaData.prioridad || 'normal',
          tipo_consulta: consultaData.tipo_consulta || 'primera_vez',
          recordatorio_enviado: false,
          clinica_alias: clinicaAlias
        }])
        .select()
        .single();
      
      if (error) {
        console.error('❌ [BACKEND] Error al insertar consulta:', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
      } else {
        console.log('✅ [BACKEND] Consulta creada exitosamente:', {
          id: consulta?.id,
          fecha_pautada: consulta?.fecha_pautada,
          hora_pautada: consulta?.hora_pautada,
          estado_consulta: consulta?.estado_consulta
        });
      }

      if (error) {
        console.error('Error creating consulta:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al crear consulta' }
        } as ApiResponse<null>);
        return;
      }

      // Enviar emails de confirmación
      try {
        // Obtener datos del paciente y médico
        const { data: pacienteData } = await supabase
          .from('pacientes')
          .select('nombres, apellidos, email')
          .eq('id', consultaData.paciente_id)
          .single();

        const { data: medicoData } = await supabase
          .from('medicos')
          .select('nombres, apellidos, email')
          .eq('id', consultaData.medico_id)
          .single();

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

      // Validación básica: la restricción de BD (chk_fecha_pautada_futura) manejará
      // la validación completa considerando la zona horaria de Venezuela
      // Solo hacemos una validación básica de formato aquí

      const { data: consulta, error } = await supabase
        .from('consultas_pacientes')
        .update(updateData)
        .eq('id', consultaId)
        .select()
        .single();

      if (error) {
        console.error('Error updating consulta:', error);
        
        // Manejar error de restricción de fecha
        if (error.code === '23514' && error.message?.includes('chk_fecha_pautada_futura')) {
          res.status(400).json({
            success: false,
            error: { 
              message: 'La fecha de la consulta debe ser futura o igual a hoy. No se pueden programar consultas en fechas pasadas.',
              code: 'INVALID_DATE'
            }
          } as ApiResponse<null>);
          return;
        }
        
        res.status(500).json({
          success: false,
          error: { message: 'Error al actualizar consulta' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: consulta
      } as ApiResponse<typeof consulta>);

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
      
      // Primero verificar que la consulta existe
      const { data: consultaExistente, error: errorConsulta } = await supabase
        .from('consultas_pacientes')
        .select('id, estado_consulta')
        .eq('id', consultaId)
        .single();

      if (errorConsulta) {
        console.error('❌ Error verificando consulta:', errorConsulta);
        res.status(404).json({
          success: false,
          error: { message: 'Consulta no encontrada', details: errorConsulta.message }
        } as ApiResponse<null>);
        return;
      }

      console.log('✅ Consulta encontrada:', consultaExistente);
      console.log('🔄 Estado actual:', consultaExistente.estado_consulta);

      // Verificar que la consulta está en un estado válido para cancelar
      if (!['agendada', 'reagendada'].includes(consultaExistente.estado_consulta)) {
        res.status(400).json({
          success: false,
          error: { message: 'Solo se pueden cancelar consultas en estado "agendada" o "reagendada"' }
        } as ApiResponse<null>);
        return;
      }

      // Obtener información del usuario autenticado
      const user = (req as any).user;
      console.log('👤 Usuario que cancela:', user);
      console.log('👤 User ID:', user?.userId);
      console.log('👤 User completo:', JSON.stringify(user, null, 2));

      // Preparar datos de actualización
      const updateData = {
        estado_consulta: 'cancelada',
        motivo_cancelacion: motivo_cancelacion,
        fecha_cancelacion: new Date().toISOString(),
        cancelado_por: user?.userId || null
      };
      
      console.log('🔄 Datos a actualizar:', updateData);

      // Actualizar el estado de la consulta a 'cancelada'
      console.log('🔄 Actualizando estado a "cancelada"...');
      const { data: consulta, error } = await supabase
        .from('consultas_pacientes')
        .update(updateData)
        .eq('id', consultaId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error actualizando consulta:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al cancelar consulta', details: error.message }
        } as ApiResponse<null>);
        return;
      }

      console.log('✅ Consulta cancelada exitosamente:', consulta);
      console.log('✅ Datos guardados:', {
        id: consulta.id,
        estado_consulta: consulta.estado_consulta,
        motivo_cancelacion: consulta.motivo_cancelacion,
        fecha_cancelacion: consulta.fecha_cancelacion,
        cancelado_por: consulta.cancelado_por
      });

      // Obtener datos completos de la consulta para el email
      const { data: consultaCompleta, error: errorCompleta } = await supabase
        .from('consultas_pacientes')
        .select(`
          id,
          motivo_consulta,
          tipo_consulta,
          fecha_pautada,
          hora_pautada,
          pacientes!inner(nombres, apellidos, email),
          medicos!fk_consultas_medico(nombres, apellidos, email)
        `)
        .eq('id', consultaId)
        .single();

      console.log('🔍 Debug - errorCompleta:', errorCompleta);
      console.log('🔍 Debug - consultaCompleta:', consultaCompleta);
      console.log('🔍 Debug - pacientes:', consultaCompleta?.pacientes);
      console.log('🔍 Debug - medicos:', consultaCompleta?.medicos);
      console.log('🔍 Debug - Condición 1 (!errorCompleta):', !errorCompleta);
      console.log('🔍 Debug - Condición 2 (consultaCompleta):', !!consultaCompleta);
      console.log('🔍 Debug - Condición 3 (consultaCompleta.pacientes):', !!consultaCompleta?.pacientes);
      console.log('🔍 Debug - Condición 4 (consultaCompleta.medicos):', !!consultaCompleta?.medicos);

      if (!errorCompleta && consultaCompleta && consultaCompleta.pacientes && consultaCompleta.medicos) {
        console.log('📧 Enviando emails de cancelación...');
        
        const emailService = new EmailService();
        const emailData = {
          pacienteNombre: `${(consultaCompleta.pacientes as any)?.nombres || ''} ${(consultaCompleta.pacientes as any)?.apellidos || ''}`,
          medicoNombre: `${(consultaCompleta.medicos as any)?.nombres || ''} ${(consultaCompleta.medicos as any)?.apellidos || ''}`,
          fecha: consultaCompleta.fecha_pautada,
          hora: consultaCompleta.hora_pautada,
          motivo: consultaCompleta.motivo_consulta,
          motivoCancelacion: motivo_cancelacion,
          tipo: consultaCompleta.tipo_consulta
        };

        try {
          console.log('📧 Datos del email:', {
            pacienteEmail: (consultaCompleta.pacientes as any)?.email,
            medicoEmail: (consultaCompleta.medicos as any)?.email,
            emailData: emailData
          });

          const emailResults = await emailService.sendConsultaCancellation(
            (consultaCompleta.pacientes as any)?.email || '',
            (consultaCompleta.medicos as any)?.email || '',
            emailData
          );

          console.log('📧 Resultados de emails:', emailResults);
        } catch (emailError) {
          console.error('❌ Error enviando emails de cancelación:', emailError);
          // No fallar la operación por error de email
        }
      } else {
        console.log('❌ No se enviaron emails - Condiciones no cumplidas');
        console.log('❌ errorCompleta:', errorCompleta);
        console.log('❌ consultaCompleta existe:', !!consultaCompleta);
        console.log('❌ pacientes existe:', !!consultaCompleta?.pacientes);
        console.log('❌ medicos existe:', !!consultaCompleta?.medicos);
      }
      
      res.json({
        success: true,
        data: {
          id: consultaId,
          estado_consulta: 'cancelada',
          motivo_cancelacion: motivo_cancelacion,
          fecha_cancelacion: new Date().toISOString(),
          cancelado_por: user?.userId || null
        }
      } as ApiResponse<any>);

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
      const { diagnostico_preliminar, observaciones } = req.body;

      if (isNaN(consultaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de consulta inválido' }
        } as ApiResponse<null>);
        return;
      }

      if (!diagnostico_preliminar) {
        res.status(400).json({
          success: false,
          error: { message: 'El diagnóstico preliminar es requerido' }
        } as ApiResponse<null>);
        return;
      }

      // Verificar que la consulta existe y está en estado válido para finalizar
      const { data: consultaExistente, error: errorConsulta } = await supabase
        .from('consultas_pacientes')
        .select('id, estado_consulta')
        .eq('id', consultaId)
        .single();

      if (errorConsulta) {
        console.error('❌ Error verificando consulta:', errorConsulta);
        res.status(404).json({
          success: false,
          error: { message: 'Consulta no encontrada', details: errorConsulta.message }
        } as ApiResponse<null>);
        return;
      }

      // Verificar que la consulta está en un estado válido para finalizar
      if (!['agendada', 'reagendada'].includes(consultaExistente.estado_consulta)) {
        res.status(400).json({
          success: false,
          error: { message: 'Solo se pueden finalizar consultas en estado "agendada" o "reagendada"' }
        } as ApiResponse<null>);
        return;
      }

      // Obtener información del usuario autenticado
      const user = (req as any).user;
      console.log('👤 Usuario que finaliza:', user);

      const { data: consulta, error } = await supabase
        .from('consultas_pacientes')
        .update({
          estado_consulta: 'finalizada',
          fecha_culminacion: new Date().toISOString(),
          diagnostico_preliminar,
          observaciones,
          actualizado_por: user?.userId || null
        })
        .eq('id', consultaId)
        .select()
        .single();

      if (error) {
        console.error('Error finalizing consulta:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al finalizar consulta' }
        } as ApiResponse<null>);
        return;
      }

      // Obtener datos completos de la consulta para el email
      const { data: consultaCompleta, error: errorCompleta } = await supabase
        .from('consultas_pacientes')
        .select(`
          id,
          motivo_consulta,
          tipo_consulta,
          fecha_pautada,
          hora_pautada,
          pacientes!inner(nombres, apellidos, email),
          medicos!inner(nombres, apellidos, email)
        `)
        .eq('id', consultaId)
        .single();

      if (!errorCompleta && consultaCompleta && consultaCompleta.pacientes && consultaCompleta.medicos) {
        console.log('📧 Enviando emails de finalización...');
        
        const emailService = new EmailService();
        const pacienteData = consultaCompleta.pacientes as any;
        const medicoData = consultaCompleta.medicos as any;
        
        const emailData = {
          pacienteNombre: `${pacienteData?.nombres || ''} ${pacienteData?.apellidos || ''}`,
          medicoNombre: `${medicoData?.nombres || ''} ${medicoData?.apellidos || ''}`,
          fecha: consultaCompleta.fecha_pautada,
          hora: consultaCompleta.hora_pautada,
          motivo: consultaCompleta.motivo_consulta,
          diagnostico: diagnostico_preliminar,
          observaciones: observaciones,
          tipo: consultaCompleta.tipo_consulta
        };

        try {
          const emailResults = await emailService.sendConsultaCompletion(
            pacienteData?.email || '',
            medicoData?.email || '',
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

      // Verificar que la consulta existe y está en estado válido para reagendar
      const { data: consultaExistente, error: errorConsulta } = await supabase
        .from('consultas_pacientes')
        .select('id, estado_consulta, fecha_pautada, hora_pautada, fecha_culminacion')
        .eq('id', consultaId)
        .single();

      if (errorConsulta) {
        console.error('❌ Error verificando consulta:', errorConsulta);
        res.status(404).json({
          success: false,
          error: { message: 'Consulta no encontrada' }
        } as ApiResponse<null>);
        return;
      }

      console.log('✅ Consulta encontrada:', consultaExistente);

      // Verificar que la consulta está en un estado válido para reagendar
      if (!['agendada', 'reagendada', 'por_agendar'].includes(consultaExistente.estado_consulta)) {
        res.status(400).json({
          success: false,
          error: { message: 'Solo se pueden reagendar consultas en estado "agendada", "reagendada" o "por_agendar"' }
        } as ApiResponse<null>);
        return;
      }

      // Actualizar la consulta
      console.log('🔄 Actualizando consulta...');
      
      // Obtener información del usuario autenticado
      const user = (req as any).user;
      console.log('👤 Usuario que reagenda:', user);

      // Preparar datos de actualización
      const updateData: any = {
        fecha_pautada,
        hora_pautada,
        estado_consulta: consultaExistente.estado_consulta === 'por_agendar' ? 'agendada' : 'reagendada',
        fecha_actualizacion: new Date().toISOString(),
        actualizado_por: user?.userId || null
      };

      // Si la consulta ya está finalizada (tiene fecha_culminacion), limpiar datos de finalización
      if (consultaExistente.fecha_culminacion) {
        console.log('🔄 Consulta finalizada reagendada - limpiando datos de finalización');
        updateData.fecha_culminacion = null;
        updateData.diagnostico_preliminar = null;
        updateData.observaciones = null;
        console.log('✅ Datos de finalización limpiados para permitir reagendamiento');
      }

      console.log('🔄 Datos a actualizar:', updateData);
      
      const { data: consulta, error } = await supabase
        .from('consultas_pacientes')
        .update(updateData)
        .eq('id', consultaId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error reagendando consulta:', error);
        res.status(500).json({
          success: false,
          error: { 
            message: 'Error al reagendar consulta', 
            details: error.message,
            constraint: error.code === '23514' ? 'Restricción de fecha_culminacion violada' : undefined
          }
        } as ApiResponse<null>);
        return;
      }

      console.log('✅ Consulta reagendada exitosamente:', {
        id: consulta.id,
        nuevaFecha: consulta.fecha_pautada,
        nuevaHora: consulta.hora_pautada,
        estado: consulta.estado_consulta,
        fechaCulminacion: consulta.fecha_culminacion
      });

      // Obtener datos completos de la consulta para el email
      const { data: consultaCompleta, error: errorCompleta } = await supabase
        .from('consultas_pacientes')
        .select(`
          id,
          motivo_consulta,
          tipo_consulta,
          fecha_pautada,
          hora_pautada,
          pacientes!inner(nombres, apellidos, email),
          medicos!inner(nombres, apellidos, email)
        `)
        .eq('id', consultaId)
        .single();

      console.log('🔍 Debug reagendamiento - errorCompleta:', errorCompleta);
      console.log('🔍 Debug reagendamiento - consultaCompleta:', consultaCompleta);
      console.log('🔍 Debug reagendamiento - pacientes:', consultaCompleta?.pacientes);
      console.log('🔍 Debug reagendamiento - medicos:', consultaCompleta?.medicos);

      if (!errorCompleta && consultaCompleta && consultaCompleta.pacientes && consultaCompleta.medicos) {
        console.log('📧 Enviando emails de reagendamiento...');
        
        const emailService = new EmailService();
        const pacienteData = consultaCompleta.pacientes as any;
        const medicoData = consultaCompleta.medicos as any;
        
        const emailData = {
          pacienteNombre: `${pacienteData?.nombres || ''} ${pacienteData?.apellidos || ''}`,
          medicoNombre: `${medicoData?.nombres || ''} ${medicoData?.apellidos || ''}`,
          fechaAnterior: consultaExistente.fecha_pautada,
          horaAnterior: consultaExistente.hora_pautada,
          fechaNueva: consultaCompleta.fecha_pautada,
          horaNueva: consultaCompleta.hora_pautada,
          motivo: consultaCompleta.motivo_consulta,
          tipo: consultaCompleta.tipo_consulta
        };

        try {
          console.log('📧 Datos del email de reagendamiento:', {
            pacienteEmail: pacienteData?.email,
            medicoEmail: medicoData?.email,
            emailData: emailData
          });

          const emailResults = await emailService.sendConsultaReschedule(
            pacienteData?.email || '',
            medicoData?.email || '',
            emailData
          );
          
          console.log('📧 Resultados de emails de reagendamiento:', emailResults);
        } catch (emailError) {
          console.error('❌ Error enviando emails de reagendamiento:', emailError);
          // No fallar la operación por error de email
        }
      } else {
        console.log('❌ No se enviaron emails de reagendamiento - Condiciones no cumplidas');
        console.log('❌ errorCompleta:', errorCompleta);
        console.log('❌ consultaCompleta existe:', !!consultaCompleta);
        console.log('❌ pacientes existe:', !!consultaCompleta?.pacientes);
        console.log('❌ medicos existe:', !!consultaCompleta?.medicos);
      }
      
      res.json({
        success: true,
        data: consulta
      } as ApiResponse<typeof consulta>);

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

      const { error } = await supabase
        .from('consultas_pacientes')
        .delete()
        .eq('id', consultaId);

      if (error) {
        console.error('Error deleting consulta:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al eliminar consulta' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: null
      } as ApiResponse<null>);

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

      const { data: consultas, error } = await supabase
        .from('vista_consultas_completa')
        .select('*')
        .or(`motivo_consulta.ilike.%${q}%,paciente_nombre.ilike.%${q}%,paciente_apellidos.ilike.%${q}%,medico_nombre.ilike.%${q}%,medico_apellidos.ilike.%${q}%`)
        .order('fecha_pautada', { ascending: false });

      if (error) {
        console.error('Error searching consultas:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al buscar consultas' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: consultas || []
      } as ApiResponse<typeof consultas>);

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
      // Obtener estadísticas básicas
      const { data: stats, error } = await supabase
        .rpc('get_estadisticas_consultas');

      if (error) {
        console.error('Error fetching consultas statistics:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al obtener estadísticas' }
        } as ApiResponse<null>);
        return;
      }

      res.json({
        success: true,
        data: stats
      } as ApiResponse<typeof stats>);

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

      let query = supabase
        .from('consultas_pacientes')
        .select('estado_consulta');

      if (fecha_inicio) {
        query = query.gte('fecha_creacion', fecha_inicio);
      }
      if (fecha_fin) {
        query = query.lte('fecha_creacion', fecha_fin);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      // Procesar datos para estadísticas por estado
      const estadisticas: { [key: string]: number } = {};

      data?.forEach(consulta => {
        const estado = consulta.estado_consulta || 'sin_estado';
        estadisticas[estado] = (estadisticas[estado] || 0) + 1;
      });

      // Convertir a array para el frontend
      const resultado = Object.entries(estadisticas).map(([estado, total]) => ({
        estado,
        total
      })).sort((a, b) => b.total - a.total);

      console.log('✅ Estadísticas por período:', resultado);

      const response: ApiResponse = {
        success: true,
        data: resultado
      };
      res.json(response);
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


      // Usar función SQL optimizada que maneja los filtros de fecha
      const { data, error } = await supabase.rpc('get_estadisticas_especialidades', {
        fecha_inicio: fecha_inicio || null,
        fecha_fin: fecha_fin || null
      });

      if (error) {
        console.error('❌ Error en consulta:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      console.log('🔍 Datos obtenidos:', data?.length, 'registros');

      // Los datos ya vienen procesados desde la función SQL
      const resultado = data?.map((row: any) => ({
        especialidad: row.especialidad,
        total: row.total
      })) || [];

      console.log('✅ Estadísticas por especialidad:', resultado);

      const response: ApiResponse = {
        success: true,
        data: resultado
      };
      res.json(response);
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

      // Usar función SQL optimizada que maneja los filtros de fecha
      const { data, error } = await supabase.rpc('get_estadisticas_medicos', {
        fecha_inicio: fecha_inicio || null,
        fecha_fin: fecha_fin || null
      });

      if (error) {
        console.error('❌ Error en consulta:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      console.log('🔍 Datos obtenidos:', data?.length, 'registros');

      // Los datos ya vienen procesados desde la función SQL
      const resultado = data?.map((row: any) => ({
        medico: row.medico,
        total: row.total
      })) || [];

      console.log('✅ Estadísticas por médico:', resultado);

      const response: ApiResponse = {
        success: true,
        data: resultado
      };
      res.json(response);
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
