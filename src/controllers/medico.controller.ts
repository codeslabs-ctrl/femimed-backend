import { Request, Response } from 'express';
import { supabase } from '../config/database.js';
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

      const { data, error } = await supabase
        .from('medicos')
        .select('*')
        .eq('id', medicoId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows found
          const response: ApiResponse = {
            success: false,
            error: { message: 'Medico not found' }
          };
          res.status(404).json(response);
          return;
        }
        throw new Error(`Database error: ${error.message}`);
      }

      const response: ApiResponse = {
        success: true,
        data: data
      };
      res.json(response);
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
      // Obtener solo médicos activos
      const { data: medicos, error: medicosError } = await supabase
        .from('medicos')
        .select('*')
        .eq('activo', true)
        .order('nombres', { ascending: true });

      if (medicosError) {
        throw new Error(`Database error: ${medicosError.message}`);
      }

      // Obtener especialidades
      const { data: especialidades, error: especialidadesError } = await supabase
        .from('especialidades')
        .select('id, nombre_especialidad');

      if (especialidadesError) {
        throw new Error(`Database error: ${especialidadesError.message}`);
      }

      // Crear un mapa de especialidades para búsqueda rápida
      const especialidadesMap = new Map();
      especialidades?.forEach(esp => {
        especialidadesMap.set(esp.id, esp.nombre_especialidad);
      });

      console.log('🔍 Especialidades encontradas:', especialidades);
      console.log('🔍 Mapa de especialidades:', especialidadesMap);

      // Combinar médicos con nombres de especialidades
      const medicosWithEspecialidad = medicos?.map(medico => {
        const especialidadNombre = especialidadesMap.get(medico.especialidad_id) || 'Especialidad no encontrada';
        console.log(`🔍 Médico ${medico.nombres} - especialidad_id: ${medico.especialidad_id} -> ${especialidadNombre}`);
        return {
          ...medico,
          especialidad_nombre: especialidadNombre
        };
      }) || [];

      const response: ApiResponse = {
        success: true,
        data: medicosWithEspecialidad
      };
      res.json(response);
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

      // Verificar si el email ya existe
      const { data: existingMedico } = await supabase
        .from('medicos')
        .select('id')
        .eq('email', email)
        .single();

      if (existingMedico) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Email already exists' }
        };
        res.status(400).json(response);
        return;
      }

      // Verificar si la cédula ya existe (si se proporciona)
      if (cedula) {
        const { data: existingMedicoByCedula } = await supabase
          .from('medicos')
          .select('id')
          .eq('cedula', cedula)
          .single();

        if (existingMedicoByCedula) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'La cédula ya está registrada en el sistema' }
          };
          res.status(400).json(response);
          return;
        }
      }

      // Crear el médico (sin clinica_alias en la base de datos)
      const { data: newMedico, error: createError } = await supabase
        .from('medicos')
        .insert({ nombres, apellidos, cedula, email, telefono, especialidad_id, mpps, cm })
        .select()
        .single();

      if (createError) {
        throw new Error(`Database error: ${createError.message}`);
      }

      // Generar username del email (parte antes del @)
      const username = email.split('@')[0];
      
      if (!username) {
        throw new Error('Email inválido: no se puede generar username');
      }
      
      // Generar OTP de 8 dígitos
      const otp = Math.floor(10000000 + Math.random() * 90000000).toString();
      
      // Hash del OTP
      const hashedOtp = await bcrypt.hash(otp, 10);
      
      // Crear usuario con OTP temporal
      const { data: newUser, error: userError } = await supabase
        .from('usuarios')
        .insert({
          username,
          email,
          password_hash: hashedOtp,
          rol: 'medico',
          medico_id: newMedico.id,
          first_login: true,
          password_changed_at: null
        })
        .select()
        .single();

      if (userError) {
        // Si falla la creación del usuario, eliminar el médico creado
        await supabase
          .from('medicos')
          .delete()
          .eq('id', newMedico.id);
        
        throw new Error(`User creation error: ${userError.message}`);
      }

      // Asignar médico a la clínica actual
      const { ClinicaService } = await import('../services/clinica.service');
      const clinicaService = new ClinicaService();
      const asignacionExitosa = await clinicaService.asignarMedicoClinica(newMedico.id);
      
      if (!asignacionExitosa) {
        console.warn('⚠️ No se pudo asignar el médico a la clínica, pero el médico fue creado');
      }

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

      // Verificar si el email ya existe en otro médico (si se está actualizando)
      if (updateData.email) {
        const { data: existingMedicoByEmail } = await supabase
          .from('medicos')
          .select('id')
          .eq('email', updateData.email)
          .neq('id', medicoId) // Excluir el médico actual
          .single();

        if (existingMedicoByEmail) {
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
        const { data: existingMedicoByCedula } = await supabase
          .from('medicos')
          .select('id')
          .eq('cedula', updateData.cedula)
          .neq('id', medicoId) // Excluir el médico actual
          .single();

        if (existingMedicoByCedula) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'La cédula ya está registrada en el sistema' }
          };
          res.status(400).json(response);
          return;
        }
      }

      const { data: updatedMedico, error: updateError } = await supabase
        .from('medicos')
        .update(updateData)
        .eq('id', medicoId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Database error: ${updateError.message}`);
      }

      const response: ApiResponse = {
        success: true,
        data: updatedMedico
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
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

      // Verificar que el médico existe
      const { data: medico, error: medicoError } = await supabase
        .from('medicos')
        .select('id, nombres, apellidos, activo')
        .eq('id', medicoId)
        .single();

      if (medicoError || !medico) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Médico no encontrado' }
        };
        res.status(404).json(response);
        return;
      }

      // Verificar si el médico ya está inactivo
      if (!medico.activo) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'El médico ya está inactivo' }
        };
        res.status(400).json(response);
        return;
      }

      // Primero verificar si hay consultas no finalizadas
      const { tieneConsultasNoFinalizadas, cantidad } = await this.verificarConsultasNoFinalizadas(medicoId);
      
      if (tieneConsultasNoFinalizadas) {
        const response: ApiResponse = {
          success: false,
          error: { 
            message: `No se puede desactivar el médico ${medico.nombres} ${medico.apellidos} porque tiene ${cantidad || 1} consulta(s) no finalizada(s). Debe finalizar todas las consultas antes de desactivar al médico.`,
            code: 'HAS_UNFINISHED_CONSULTAS'
          }
        };
        res.status(400).json(response);
        return;
      }

      // Verificar si el médico tiene pacientes tratados (consultas finalizadas, historial, informes)
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
   * Verifica si un médico tiene consultas no finalizadas
   */
  private async verificarConsultasNoFinalizadas(medicoId: number): Promise<{ tieneConsultasNoFinalizadas: boolean; cantidad?: number }> {
    try {
      // Verificar consultas no finalizadas
      const { data: consultas, error: consultasError } = await supabase
        .from('consultas_pacientes')
        .select('id, estado_consulta')
        .eq('medico_id', medicoId)
        .not('estado_consulta', 'eq', 'finalizada')
        .not('estado_consulta', 'eq', 'completada');

      if (consultasError) {
        console.error('Error verificando consultas no finalizadas:', consultasError);
        throw new Error('Error verificando consultas no finalizadas del médico');
      }

      if (consultas && consultas.length > 0) {
        return { tieneConsultasNoFinalizadas: true, cantidad: consultas.length };
      }

      return { tieneConsultasNoFinalizadas: false };
    } catch (error) {
      console.error('Error en verificarConsultasNoFinalizadas:', error);
      throw error;
    }
  }

  /**
   * Verifica si un médico tiene pacientes tratados (consultas finalizadas, historial, informes)
   */
  private async verificarPacientesTratados(medicoId: number): Promise<boolean> {
    try {
      // Verificar consultas finalizadas (historial)
      const { data: consultas, error: consultasError } = await supabase
        .from('consultas_pacientes')
        .select('id')
        .eq('medico_id', medicoId)
        .in('estado_consulta', ['finalizada', 'completada'])
        .limit(1);

      if (consultasError) {
        console.error('Error verificando consultas:', consultasError);
        throw new Error('Error verificando consultas del médico');
      }

      if (consultas && consultas.length > 0) {
        return true;
      }

      // Verificar historial médico
      const { data: historial, error: historialError } = await supabase
        .from('historico_pacientes')
        .select('id')
        .eq('medico_id', medicoId)
        .limit(1);

      if (historialError) {
        console.error('Error verificando historial:', historialError);
        throw new Error('Error verificando historial del médico');
      }

      if (historial && historial.length > 0) {
        return true;
      }

      // Verificar informes médicos
      const { data: informes, error: informesError } = await supabase
        .from('informes_medicos')
        .select('id')
        .eq('medico_id', medicoId)
        .limit(1);

      if (informesError) {
        console.error('Error verificando informes:', informesError);
        throw new Error('Error verificando informes del médico');
      }

      if (informes && informes.length > 0) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error en verificarPacientesTratados:', error);
      throw error;
    }
  }

  /**
   * Marca un médico como inactivo
   */
  private async marcarMedicoComoInactivo(medicoId: number): Promise<void> {
    try {
      // Marcar médico como inactivo
      const { error: medicoError } = await supabase
        .from('medicos')
        .update({ activo: false })
        .eq('id', medicoId);

      if (medicoError) {
        throw new Error(`Error marcando médico como inactivo: ${medicoError.message}`);
      }

      // Marcar usuario asociado como inactivo
      const { error: usuarioError } = await supabase
        .from('usuarios')
        .update({ activo: false })
        .eq('medico_id', medicoId);

      if (usuarioError) {
        console.warn('Advertencia: No se pudo marcar el usuario como inactivo:', usuarioError.message);
        // No lanzamos error aquí porque el médico ya fue marcado como inactivo
      }

      console.log(`✅ Médico ${medicoId} marcado como inactivo`);
    } catch (error) {
      console.error('Error marcando médico como inactivo:', error);
      throw error;
    }
  }

  /**
   * Activa un médico inactivo
   */
  async activarMedico(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
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

      // Verificar que el médico existe
      const { data: medico, error: medicoError } = await supabase
        .from('medicos')
        .select('id, nombres, apellidos, activo')
        .eq('id', medicoId)
        .single();

      if (medicoError || !medico) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Médico no encontrado' }
        };
        res.status(404).json(response);
        return;
      }

      // Verificar si el médico ya está activo
      if (medico.activo) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'El médico ya está activo' }
        };
        res.status(400).json(response);
        return;
      }

      // Activar médico
      const { error: updateError } = await supabase
        .from('medicos')
        .update({ activo: true })
        .eq('id', medicoId);

      if (updateError) {
        throw new Error(`Error activando médico: ${updateError.message}`);
      }

      // Activar usuario asociado
      const { error: usuarioError } = await supabase
        .from('usuarios')
        .update({ activo: true })
        .eq('medico_id', medicoId);

      if (usuarioError) {
        console.warn('Advertencia: No se pudo activar el usuario:', usuarioError.message);
        // No lanzamos error aquí porque el médico ya fue activado
      }

      const response: ApiResponse = {
        success: true,
        data: { 
          message: `Médico ${medico.nombres} ${medico.apellidos} activado exitosamente`,
          accion: 'activado'
        }
      };
      res.json(response);
    } catch (error) {
      console.error('Error activando médico:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  /**
   * Elimina físicamente un médico del sistema
   */
  private async eliminarMedicoFisicamente(medicoId: number): Promise<void> {
    try {
      // Eliminar usuario asociado primero (por las foreign keys)
      const { error: usuarioError } = await supabase
        .from('usuarios')
        .delete()
        .eq('medico_id', medicoId);

      if (usuarioError) {
        console.warn('Advertencia: No se pudo eliminar el usuario:', usuarioError.message);
        // Continuamos con la eliminación del médico
      }

      // Eliminar médico
      const { error: medicoError } = await supabase
        .from('medicos')
        .delete()
        .eq('id', medicoId);

      if (medicoError) {
        throw new Error(`Error eliminando médico: ${medicoError.message}`);
      }

      console.log(`✅ Médico ${medicoId} eliminado físicamente del sistema`);
    } catch (error) {
      console.error('Error eliminando médico físicamente:', error);
      throw error;
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

      // Construir query base - solo médicos activos
      let query = supabase
        .from('medicos')
        .select('*')
        .eq('activo', true);

      // Si el término parece un email, buscar solo por email
      if (searchTerm.includes('@')) {
        query = query.ilike('email', `%${searchTerm}%`);
      } else {
        // Para otros términos, buscar en nombres, apellidos y email
        query = query.or(`nombres.ilike.%${searchTerm}%,apellidos.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
      }

      // Ejecutar la búsqueda
      const { data: medicos, error: medicosError } = await query
        .order('nombres', { ascending: true });

      if (medicosError) {
        throw new Error(`Database error: ${medicosError.message}`);
      }

      // Obtener solo especialidades activas
      const { data: especialidades, error: especialidadesError } = await supabase
        .from('especialidades')
        .select('id, nombre_especialidad')
        .eq('activa', true);

      if (especialidadesError) {
        throw new Error(`Database error: ${especialidadesError.message}`);
      }

      // Crear un mapa de especialidades para búsqueda rápida
      const especialidadesMap = new Map();
      especialidades?.forEach(esp => {
        especialidadesMap.set(esp.id, esp.nombre_especialidad);
      });

      // Combinar médicos con nombres de especialidades
      const medicosWithEspecialidad = medicos?.map(medico => ({
        ...medico,
        especialidad_nombre: especialidadesMap.get(medico.especialidad_id) || 'Especialidad no encontrada'
      })) || [];

      const response: ApiResponse = {
        success: true,
        data: medicosWithEspecialidad
      };
      res.json(response);
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

      console.log('🔍 getMedicosByEspecialidad - especialidadId recibido:', especialidadId, 'parseado:', id);

      if (isNaN(id) || id <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      // Obtener médicos por especialidad
      const { data: medicos, error: medicosError } = await supabase
        .from('medicos')
        .select('*')
        .eq('especialidad_id', id)
        .eq('activo', true)
        .order('nombres', { ascending: true });

      if (medicosError) {
        console.error('❌ Error obteniendo médicos:', medicosError);
        throw new Error(`Database error: ${medicosError.message}`);
      }

      // Obtener todas las especialidades para mapear nombres (más robusto que .single())
      const { data: especialidades, error: especialidadesError } = await supabase
        .from('especialidades')
        .select('id, nombre_especialidad')
        .eq('id', id);

      let nombreEspecialidad = 'Especialidad no encontrada';
      if (!especialidadesError && especialidades && especialidades.length > 0) {
        nombreEspecialidad = especialidades[0].nombre_especialidad || 'Especialidad no encontrada';
      } else if (especialidadesError) {
        console.warn('⚠️ No se pudo obtener la especialidad:', especialidadesError.message);
      }

      // Combinar médicos con nombres de especialidades
      const medicosWithEspecialidad = medicos?.map(medico => ({
        ...medico,
        especialidad_nombre: nombreEspecialidad
      })) || [];

      console.log('✅ Médicos encontrados:', medicosWithEspecialidad.length);
      
      const response: ApiResponse = {
        success: true,
        data: medicosWithEspecialidad
      };
      res.json(response);
    } catch (error) {
      console.error('❌ Error en getMedicosByEspecialidad:', error);
      console.error('❌ Stack trace:', (error as Error).stack);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message || 'Error interno del servidor' }
      };
      res.status(500).json(response);
    }
  }
}
