import { RemisionRepository, RemisionRepositoryType } from '../repositories/remision.repository.js';
import { 
  RemisionData, 
  CreateRemisionRequest, 
  UpdateRemisionStatusRequest,
  RemisionWithDetails 
} from '../models/remision.model.js';
import { EmailService } from './email.service.js';
import { postgresPool } from '../config/database.js';

export class RemisionService {
  private remisionRepository: InstanceType<RemisionRepositoryType>;

  constructor() {
    this.remisionRepository = new RemisionRepository();
  }

  async createRemision(remisionData: CreateRemisionRequest): Promise<RemisionData> {
    try {
      console.log('ðŸ” Creating remision with data:', remisionData);
      console.log('ðŸ” Paciente ID type:', typeof remisionData.paciente_id, 'value:', remisionData.paciente_id);
      console.log('ðŸ” Medico remitente ID:', remisionData.medico_remitente_id);
      console.log('ðŸ” Medico remitido ID:', remisionData.medico_remitido_id);
      
      // Validar datos requeridos
      if (!remisionData.paciente_id || !remisionData.medico_remitente_id || 
          !remisionData.medico_remitido_id || !remisionData.motivo_remision) {
        throw new Error('Missing required fields: paciente_id, medico_remitente_id, medico_remitido_id, motivo_remision');
      }

      // Validar que no se remita al mismo mÃ©dico
      if (remisionData.medico_remitente_id === remisionData.medico_remitido_id) {
        throw new Error('Cannot refer patient to the same doctor');
      }

      // Validar que el motivo no estÃ© vacÃ­o
      if (remisionData.motivo_remision.trim().length < 5) {
        throw new Error('Motivo de remisiÃ³n must be at least 5 characters long');
      }

      const newRemisionData = {
        ...remisionData,
        estado_remision: 'Pendiente' as const,
        fecha_remision: new Date().toISOString()
      };

      // Crear la remisiÃ³n en la base de datos
      const createdRemision = await this.remisionRepository.createRemision(newRemisionData);

      // Crear objeto RemisionData completo para las funciones auxiliares
      const remisionDataComplete: RemisionData = {
        ...remisionData,
        estado_remision: 'Pendiente',
        fecha_remision: new Date().toISOString()
      };

      // Crear consulta automÃ¡ticamente
      try {
        await this.createConsultaFromRemision(remisionDataComplete);
        console.log('âœ… Consulta creada automÃ¡ticamente desde remisiÃ³n');
      } catch (consultaError) {
        console.error('âŒ Error creando consulta desde remisiÃ³n:', consultaError);
        // No fallar la creaciÃ³n de remisiÃ³n si falla la consulta
      }

      // Enviar email de notificaciÃ³n al mÃ©dico remitido
      try {
        await this.sendRemisionNotificationEmail(remisionDataComplete);
        console.log('âœ… Email de remisiÃ³n enviado exitosamente');
      } catch (emailError) {
        console.error('âŒ Error enviando email de remisiÃ³n:', emailError);
        // No fallar la creaciÃ³n de remisiÃ³n si falla el email
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
   * EnvÃ­a email de notificaciÃ³n de remisiÃ³n al mÃ©dico remitido
   */
  private async sendRemisionNotificationEmail(remision: RemisionData): Promise<void> {
    try {
      // Validar que el paciente_id sea un nÃºmero vÃ¡lido
      if (!remision.paciente_id || isNaN(Number(remision.paciente_id))) {
        throw new Error(`ID de paciente invÃ¡lido: ${remision.paciente_id}`);
      }

      let pacienteData: any;
      let medicoRemitenteData: any;
      let medicoRemitidoData: any;
      let especialidadData: any;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Obtener datos del paciente
        console.log('ðŸ” Buscando paciente con ID:', remision.paciente_id, 'tipo:', typeof remision.paciente_id);
        const pacienteResult = await client.query(
          'SELECT nombres, apellidos, edad, sexo FROM pacientes WHERE id = $1',
          [Number(remision.paciente_id)]
        );
        if (pacienteResult.rows.length === 0) {
          throw new Error('Paciente no encontrado');
        }
        pacienteData = pacienteResult.rows[0];

        // Obtener datos del mÃ©dico remitente
        const medicoRemitenteResult = await client.query(
          'SELECT nombres, apellidos, email, especialidad_id FROM medicos WHERE id = $1',
          [remision.medico_remitente_id]
        );
        if (medicoRemitenteResult.rows.length === 0) {
          throw new Error('MÃ©dico remitente no encontrado');
        }
        medicoRemitenteData = medicoRemitenteResult.rows[0];

        // Obtener datos del mÃ©dico remitido
        const medicoRemitidoResult = await client.query(
          'SELECT nombres, apellidos, email FROM medicos WHERE id = $1',
          [remision.medico_remitido_id]
        );
        if (medicoRemitidoResult.rows.length === 0) {
          throw new Error('MÃ©dico remitido no encontrado');
        }
        medicoRemitidoData = medicoRemitidoResult.rows[0];

        // Obtener especialidad del mÃ©dico remitente
        if (medicoRemitenteData.especialidad_id) {
          const especialidadResult = await client.query(
            'SELECT nombre_especialidad FROM especialidades WHERE id = $1',
            [medicoRemitenteData.especialidad_id]
          );
          if (especialidadResult.rows.length > 0) {
            especialidadData = especialidadResult.rows[0];
          } else {
            console.warn('âš ï¸ No se pudo obtener la especialidad del mÃ©dico remitente');
          }
        }
      } finally {
        client.release();
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
        throw new Error('No se pudo enviar el email de notificaciÃ³n');
      }

      console.log(`ðŸ“§ Email de remisiÃ³n enviado a: ${medicoRemitidoData.email}`);
    } catch (error) {
      console.error('âŒ Error en sendRemisionNotificationEmail:', error);
      throw error;
    }
  }

  /**
   * Crea una consulta automÃ¡ticamente desde una remisiÃ³n
   */
  private async createConsultaFromRemision(remision: RemisionData): Promise<void> {
    try {
      console.log('ðŸ” Creando consulta desde remisiÃ³n:', remision.id);

      // Obtener clinica_alias de las variables de entorno
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'FemiMed';

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
        observaciones: `Consulta generada automÃ¡ticamente por remisiÃ³n. ${remision.observaciones || ''}`,
        recordatorio_enviado: false,
        clinica_alias: clinicaAlias
      };

      console.log('ðŸ” Datos de consulta a crear:', consultaData);

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const insertQuery = `
          INSERT INTO consultas_pacientes (
            paciente_id, medico_id, medico_remitente_id, motivo_consulta,
            tipo_consulta, estado_consulta, fecha_pautada, hora_pautada,
            duracion_estimada, prioridad, observaciones, recordatorio_enviado, clinica_alias
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `;
        
        const result = await client.query(insertQuery, [
          consultaData.paciente_id,
          consultaData.medico_id,
          consultaData.medico_remitente_id,
          consultaData.motivo_consulta,
          consultaData.tipo_consulta,
          consultaData.estado_consulta,
          consultaData.fecha_pautada,
          consultaData.hora_pautada,
          consultaData.duracion_estimada,
          consultaData.prioridad,
          consultaData.observaciones,
          consultaData.recordatorio_enviado,
          consultaData.clinica_alias
        ]);

        console.log('âœ… Consulta creada exitosamente:', result.rows[0].id);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('âŒ Error en createConsultaFromRemision:', error);
      throw error;
    }
  }
}
