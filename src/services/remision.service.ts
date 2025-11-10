import { RemisionRepository } from '../repositories/remision.repository.js';
import { 
  RemisionData, 
  CreateRemisionRequest, 
  UpdateRemisionStatusRequest,
  RemisionWithDetails 
} from '../models/remision.model.js';
import { EmailService } from './email.service.js';
import { supabase } from '../config/database.js';

export class RemisionService {
  private remisionRepository: RemisionRepository;

  constructor() {
    this.remisionRepository = new RemisionRepository();
  }

  async createRemision(remisionData: CreateRemisionRequest): Promise<RemisionData> {
    try {
      console.log('🔍 Creating remision with data:', remisionData);
      console.log('🔍 Paciente ID type:', typeof remisionData.paciente_id, 'value:', remisionData.paciente_id);
      console.log('🔍 Medico remitente ID:', remisionData.medico_remitente_id);
      console.log('🔍 Medico remitido ID:', remisionData.medico_remitido_id);
      
      // Validar datos requeridos
      if (!remisionData.paciente_id || !remisionData.medico_remitente_id || 
          !remisionData.medico_remitido_id || !remisionData.motivo_remision) {
        throw new Error('Missing required fields: paciente_id, medico_remitente_id, medico_remitido_id, motivo_remision');
      }

      // Validar que no se remita al mismo médico
      if (remisionData.medico_remitente_id === remisionData.medico_remitido_id) {
        throw new Error('Cannot refer patient to the same doctor');
      }

      // Validar que el motivo no esté vacío
      if (remisionData.motivo_remision.trim().length < 5) {
        throw new Error('Motivo de remisión must be at least 5 characters long');
      }

      const newRemisionData = {
        ...remisionData,
        estado_remision: 'Pendiente' as const,
        fecha_remision: new Date().toISOString()
      };

      // Crear la remisión en la base de datos
      const createdRemision = await this.remisionRepository.createRemision(newRemisionData);

      // Crear objeto RemisionData completo para las funciones auxiliares
      const remisionDataComplete: RemisionData = {
        ...remisionData,
        estado_remision: 'Pendiente',
        fecha_remision: new Date().toISOString()
      };

      // Crear consulta automáticamente
      try {
        await this.createConsultaFromRemision(remisionDataComplete);
        console.log('✅ Consulta creada automáticamente desde remisión');
      } catch (consultaError) {
        console.error('❌ Error creando consulta desde remisión:', consultaError);
        // No fallar la creación de remisión si falla la consulta
      }

      // Enviar email de notificación al médico remitido
      try {
        await this.sendRemisionNotificationEmail(remisionDataComplete);
        console.log('✅ Email de remisión enviado exitosamente');
      } catch (emailError) {
        console.error('❌ Error enviando email de remisión:', emailError);
        // No fallar la creación de remisión si falla el email
      }

      return createdRemision;
    } catch (error) {
      throw new Error(`Failed to create remision: ${(error as Error).message}`);
    }
  }

  async updateRemisionStatus(id: number, statusData: UpdateRemisionStatusRequest): Promise<RemisionData> {
    try {
      // Validar ID
      if (!id || id <= 0) {
        throw new Error('Valid remision ID is required');
      }

      // Validar estado
      const validStates = ['Pendiente', 'Aceptada', 'Rechazada', 'Completada'];
      if (!validStates.includes(statusData.estado_remision)) {
        throw new Error(`Invalid estado_remision. Must be one of: ${validStates.join(', ')}`);
      }

      return await this.remisionRepository.updateRemisionStatus(
        id, 
        statusData.estado_remision, 
        statusData.observaciones
      );
    } catch (error) {
      throw new Error(`Failed to update remision status: ${(error as Error).message}`);
    }
  }

  async getRemisionesByMedico(medicoId: number, tipo: 'remitente' | 'remitido'): Promise<RemisionWithDetails[]> {
    try {
      if (!medicoId || medicoId <= 0) {
        throw new Error('Valid medico ID is required');
      }

      if (!['remitente', 'remitido'].includes(tipo)) {
        throw new Error('Tipo must be either "remitente" or "remitido"');
      }

      return await this.remisionRepository.getRemisionesByMedico(medicoId, tipo);
    } catch (error) {
      throw new Error(`Failed to get remisiones by medico: ${(error as Error).message}`);
    }
  }

  async getRemisionesByPaciente(pacienteId: number): Promise<RemisionWithDetails[]> {
    try {
      if (!pacienteId || pacienteId <= 0) {
        throw new Error('Valid paciente ID is required');
      }

      return await this.remisionRepository.getRemisionesByPaciente(pacienteId);
    } catch (error) {
      throw new Error(`Failed to get remisiones by paciente: ${(error as Error).message}`);
    }
  }

  async getRemisionById(id: number): Promise<RemisionWithDetails | null> {
    try {
      if (!id || id <= 0) {
        throw new Error('Valid remision ID is required');
      }

      return await this.remisionRepository.getRemisionById(id);
    } catch (error) {
      throw new Error(`Failed to get remision by id: ${(error as Error).message}`);
    }
  }

  async getAllRemisiones(): Promise<RemisionWithDetails[]> {
    try {
      const result = await this.remisionRepository.findAll();
      return result.data;
    } catch (error) {
      throw new Error(`Failed to get all remisiones: ${(error as Error).message}`);
    }
  }

  async getRemisionesByStatus(estado: string): Promise<RemisionWithDetails[]> {
    try {
      const validStates = ['Pendiente', 'Aceptada', 'Rechazada', 'Completada'];
      if (!validStates.includes(estado)) {
        throw new Error(`Invalid estado. Must be one of: ${validStates.join(', ')}`);
      }

      const result = await this.remisionRepository.findAll({ estado_remision: estado });
      return result.data;
    } catch (error) {
      throw new Error(`Failed to get remisiones by status: ${(error as Error).message}`);
    }
  }

  async getRemisionesStatistics(): Promise<{
    total: number;
    pendientes: number;
    aceptadas: number;
    rechazadas: number;
    completadas: number;
  }> {
    try {
      const result = await this.remisionRepository.findAll();
      const allRemisiones = result.data;
      
      const statistics = {
        total: allRemisiones.length,
        pendientes: 0,
        aceptadas: 0,
        rechazadas: 0,
        completadas: 0
      };

      allRemisiones.forEach((remision: any) => {
        switch (remision.estado_remision) {
          case 'Pendiente':
            statistics.pendientes++;
            break;
          case 'Aceptada':
            statistics.aceptadas++;
            break;
          case 'Rechazada':
            statistics.rechazadas++;
            break;
          case 'Completada':
            statistics.completadas++;
            break;
        }
      });

      return statistics;
    } catch (error) {
      throw new Error(`Failed to get remisiones statistics: ${(error as Error).message}`);
    }
  }

  /**
   * Envía email de notificación de remisión al médico remitido
   */
  private async sendRemisionNotificationEmail(remision: RemisionData): Promise<void> {
    try {
      // Validar que el paciente_id sea un número válido
      if (!remision.paciente_id || isNaN(Number(remision.paciente_id))) {
        throw new Error(`ID de paciente inválido: ${remision.paciente_id}`);
      }

      // Obtener datos del paciente
      console.log('🔍 Buscando paciente con ID:', remision.paciente_id, 'tipo:', typeof remision.paciente_id);
      const { data: pacienteData, error: pacienteError } = await supabase
        .from('pacientes')
        .select('nombres, apellidos, edad, sexo')
        .eq('id', Number(remision.paciente_id))
        .single();

      if (pacienteError) {
        throw new Error(`Error obteniendo datos del paciente: ${pacienteError.message}`);
      }

      // Obtener datos del médico remitente
      const { data: medicoRemitenteData, error: medicoRemitenteError } = await supabase
        .from('medicos')
        .select('nombres, apellidos, email, especialidad_id')
        .eq('id', remision.medico_remitente_id)
        .single();

      if (medicoRemitenteError) {
        throw new Error(`Error obteniendo datos del médico remitente: ${medicoRemitenteError.message}`);
      }

      // Obtener datos del médico remitido
      const { data: medicoRemitidoData, error: medicoRemitidoError } = await supabase
        .from('medicos')
        .select('nombres, apellidos, email')
        .eq('id', remision.medico_remitido_id)
        .single();

      if (medicoRemitidoError) {
        throw new Error(`Error obteniendo datos del médico remitido: ${medicoRemitidoError.message}`);
      }

      // Obtener especialidad del médico remitente
      const { data: especialidadData, error: especialidadError } = await supabase
        .from('especialidades')
        .select('nombre_especialidad')
        .eq('id', medicoRemitenteData.especialidad_id)
        .single();

      if (especialidadError) {
        console.warn('⚠️ No se pudo obtener la especialidad del médico remitente');
      }

      // Preparar datos para el email
      const emailData = {
        pacienteNombre: pacienteData.nombres,
        pacienteApellidos: pacienteData.apellidos,
        pacienteEdad: pacienteData.edad,
        pacienteSexo: pacienteData.sexo,
        medicoRemitenteNombre: medicoRemitenteData.nombres,
        medicoRemitenteApellidos: medicoRemitenteData.apellidos,
        medicoRemitenteEspecialidad: especialidadData?.nombre_especialidad || 'Especialidad no especificada',
        motivoRemision: remision.motivo_remision,
        observaciones: remision.observaciones || 'No hay observaciones adicionales',
        fechaRemision: remision.fecha_remision ? 
          new Date(remision.fecha_remision).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : 
          new Date().toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
      };

      // Enviar email
      const emailService = new EmailService();
      const emailSent = await emailService.sendRemisionNotification(
        medicoRemitidoData.email,
        emailData
      );

      if (!emailSent) {
        throw new Error('No se pudo enviar el email de notificación');
      }

      console.log(`📧 Email de remisión enviado a: ${medicoRemitidoData.email}`);
    } catch (error) {
      console.error('❌ Error en sendRemisionNotificationEmail:', error);
      throw error;
    }
  }

  /**
   * Crea una consulta automáticamente desde una remisión
   */
  private async createConsultaFromRemision(remision: RemisionData): Promise<void> {
    try {
      console.log('🔍 Creando consulta desde remisión:', remision.id);

      // Obtener clinica_alias desde variable de entorno
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'femimed';

      // Preparar datos de la consulta
             const consultaData = {
               paciente_id: remision.paciente_id,
               medico_id: remision.medico_remitido_id,
               medico_remitente_id: remision.medico_remitente_id,
               motivo_consulta: remision.motivo_remision,
               tipo_consulta: 'seguimiento' as const,
               estado_consulta: 'por_agendar' as const,
               fecha_pautada: new Date().toISOString().split('T')[0], // Fecha actual
               hora_pautada: '00:00:00', // Hora por defecto en lugar de NULL
               duracion_estimada: 30,
               prioridad: 'normal' as const,
               observaciones: `Consulta generada automáticamente por remisión. ${remision.observaciones || ''}`,
               recordatorio_enviado: false,
               clinica_alias: clinicaAlias
             };

      console.log('🔍 Datos de consulta a crear:', consultaData);

      // Crear la consulta en la base de datos
      const { data: consulta, error } = await supabase
        .from('consultas_pacientes')
        .insert([consultaData])
        .select()
        .single();

      if (error) {
        throw new Error(`Error creando consulta: ${error.message}`);
      }

      console.log('✅ Consulta creada exitosamente:', consulta.id);
    } catch (error) {
      console.error('❌ Error en createConsultaFromRemision:', error);
      throw error;
    }
  }
}
