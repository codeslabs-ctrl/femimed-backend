import { PatientRepository, PatientData, PatientRepositoryType } from '../repositories/patient.repository.js';
import { PaginationInfo } from '../types/index.js';
import { postgresPool } from '../config/database.js';

export class PatientService {
  private patientRepository: InstanceType<PatientRepositoryType>;

  constructor() {
    this.patientRepository = new PatientRepository();
  }

  async getAllPatients(
    filters: Record<string, any> = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 10 }
  ): Promise<{ data: PatientData[]; pagination: PaginationInfo }> {
    try {
      return await this.patientRepository.findAll(filters, pagination);
    } catch (error) {
      throw new Error(`Failed to get patients: ${(error as Error).message}`);
    }
  }

  async getPatientById(id: string): Promise<PatientData | null> {
    try {
      // Obtener datos básicos del paciente
      const patient = await this.patientRepository.findById(id);
      
      if (!patient) {
        return null;
      }

      // Obtener la información médica más reciente del paciente
      let latestHistoric: any = null;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT motivo_consulta, diagnostico, conclusiones, plan
           FROM historico_pacientes
           WHERE paciente_id = $1
           ORDER BY fecha_consulta DESC
           LIMIT 1`,
          [id]
        );

        if (result.rows.length > 0) {
          latestHistoric = result.rows[0];
          console.log('🔍 Histórico médico encontrado (PostgreSQL):', latestHistoric);
        } else {
          console.log('🔍 No se encontró historial médico para el paciente:', id);
        }
      } catch (dbError) {
        console.error('❌ Error obteniendo historico médico (PostgreSQL):', dbError);
        // Si hay error, devolver solo los datos básicos del paciente
        return patient;
      } finally {
        client.release();
      }

      // Si se encontró información médica, agregarla al paciente
      if (latestHistoric) {
        console.log('🔍 Datos médicos encontrados:', latestHistoric);
        return {
          ...patient,
          motivo_consulta: latestHistoric.motivo_consulta || null,
          diagnostico: latestHistoric.diagnostico || null,
          conclusiones: latestHistoric.conclusiones || null,
          plan: latestHistoric.plan || null
        };
      }

      return patient;
    } catch (error) {
      console.error('❌ Error en getPatientById:', error);
      throw new Error(`Failed to get patient: ${(error as Error).message}`);
    }
  }

  async getPatientByEmail(email: string): Promise<PatientData | null> {
    try {
      return await this.patientRepository.findByEmail(email);
    } catch (error) {
      throw new Error(`Failed to get patient by email: ${(error as Error).message}`);
    }
  }

  async checkEmailAvailability(email: string): Promise<boolean> {
    try {
      const patient = await this.patientRepository.findByEmail(email);
      return patient === null; // true if available (no patient found), false if not available
    } catch (error) {
      // If error is "not found", email is available
      if (error instanceof Error && error.message.includes('not found')) {
        return true;
      }
      throw new Error(`Failed to check email availability: ${(error as Error).message}`);
    }
  }

  async createPatient(patientData: Omit<PatientData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>, medicoId?: number): Promise<PatientData> {
    try {
      console.log('🔍 PatientService - Validando datos del paciente:', patientData);
      
      // Validate required fields
      if (!patientData.nombres || !patientData.apellidos || !patientData.edad || !patientData.sexo) {
        console.error('❌ PatientService - Campos requeridos faltantes:', {
          nombres: patientData.nombres,
          apellidos: patientData.apellidos,
          edad: patientData.edad,
          sexo: patientData.sexo
        });
        throw new Error('Missing required fields: nombres, apellidos, edad, sexo');
      }

      // Validate age
      if (patientData.edad < 0 || patientData.edad > 150) {
        console.error('❌ PatientService - Edad inválida:', patientData.edad);
        throw new Error('Age must be between 0 and 150');
      }

      // Validate sex
      const validSexes = ['Masculino', 'Femenino', 'Otro'];
      if (!validSexes.includes(patientData.sexo)) {
        console.error('❌ PatientService - Sexo inválido:', patientData.sexo);
        throw new Error('Sex must be one of: Masculino, Femenino, Otro');
      }

      // Validate email uniqueness
      if (patientData.email) {
        console.log('🔍 PatientService - Verificando unicidad del email:', patientData.email);
        const existingPatientByEmail = await this.patientRepository.findByEmail(patientData.email);
        if (existingPatientByEmail) {
          console.error('❌ PatientService - Email ya existe:', patientData.email);
          throw new Error('El email ya está registrado en el sistema');
        }
      }

      // Validate cedula uniqueness
      if (patientData.cedula) {
        console.log('🔍 PatientService - Verificando unicidad de la cédula:', patientData.cedula);
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          const result = await client.query(
            'SELECT id FROM pacientes WHERE cedula = $1 LIMIT 1',
            [patientData.cedula]
          );
          if (result.rows.length > 0) {
            console.error('❌ PatientService - Cédula ya existe:', patientData.cedula);
            throw new Error('La cédula ya está registrada en el sistema');
          }
        } finally {
          client.release();
        }
      }

      // Separar datos del paciente de los datos médicos
      const { motivo_consulta, diagnostico, conclusiones, plan, ...patientBasicData } = patientData;
      
      // Agregar clinica_alias desde variable de entorno
      const clinicaAlias = process.env['CLINICA_ALIAS'];
      if (!clinicaAlias) {
        throw new Error('CLINICA_ALIAS no está configurada en las variables de entorno');
      }
      
      console.log('✅ PatientService - Validaciones pasadas, iniciando transacción...');
      console.log('🏥 PatientService - Clínica asignada:', clinicaAlias);
      
      // PostgreSQL implementation with transaction
      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Incluir clinica_alias en los datos del paciente
        const patientDataWithClinica = {
          ...patientBasicData,
          clinica_alias: clinicaAlias
        };

        // Crear el paciente usando el repositorio
        const newPatient = await this.patientRepository.create(patientDataWithClinica);
        console.log('✅ PatientService - Paciente creado:', newPatient.id);

        // Si hay datos médicos, crear registro en historico_pacientes
        if (motivo_consulta || diagnostico || conclusiones || plan || medicoId) {
          const medicalData = {
            paciente_id: newPatient.id,
            motivo_consulta: motivo_consulta || null,
            diagnostico: diagnostico || null,
            conclusiones: conclusiones || null,
            plan: plan || null,
            medico_id: medicoId || null,
            clinica_alias: clinicaAlias,
            fecha_consulta: new Date().toISOString()
          };

          await client.query(
            `INSERT INTO historico_pacientes 
             (paciente_id, motivo_consulta, diagnostico, conclusiones, plan, medico_id, clinica_alias, fecha_consulta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              medicalData.paciente_id,
              medicalData.motivo_consulta,
              medicalData.diagnostico,
              medicalData.conclusiones,
              medicalData.plan,
              medicalData.medico_id,
              medicalData.clinica_alias,
              medicalData.fecha_consulta
            ]
          );
          console.log('✅ PatientService - Historial médico creado');
        }

        await client.query('COMMIT');
        console.log('✅ PatientService - Transacción completada exitosamente');
        return newPatient;
      } catch (dbError: any) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('❌ Error al hacer rollback:', rollbackError);
        }
        console.error('❌ PatientService - Error en transacción PostgreSQL:', dbError);
        throw new Error(`Transaction failed: ${dbError.message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ PatientService - Error en createPatient:', error);
      throw new Error(`Failed to create patient: ${(error as Error).message}`);
    }
  }

  async updatePatient(id: string, patientData: Partial<PatientData>): Promise<PatientData> {
    try {
      // Validate age if provided
      if (patientData.edad !== undefined) {
        if (patientData.edad < 0 || patientData.edad > 150) {
          throw new Error('Age must be between 0 and 150');
        }
      }

      // Validate sex if provided
      if (patientData.sexo) {
        const validSexes = ['Masculino', 'Femenino', 'Otro'];
        if (!validSexes.includes(patientData.sexo)) {
          throw new Error('Sex must be one of: Masculino, Femenino, Otro');
        }
      }

      // Validate email uniqueness if provided
      if (patientData.email) {
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          const result = await client.query(
            'SELECT id FROM pacientes WHERE email = $1 AND id != $2 LIMIT 1',
            [patientData.email, id]
          );
          if (result.rows.length > 0) {
            throw new Error('El email ya está registrado en el sistema');
          }
        } finally {
          client.release();
        }
      }

      // Validate cedula uniqueness if provided
      if (patientData.cedula) {
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          const result = await client.query(
            'SELECT id FROM pacientes WHERE cedula = $1 AND id != $2 LIMIT 1',
            [patientData.cedula, id]
          );
          if (result.rows.length > 0) {
            throw new Error('La cédula ya está registrada en el sistema');
          }
        } finally {
          client.release();
        }
      }

      return await this.patientRepository.update(id, patientData);
    } catch (error) {
      throw new Error(`Failed to update patient: ${(error as Error).message}`);
    }
  }

  async deletePatient(id: string): Promise<boolean> {
    try {
      return await this.patientRepository.delete(id);
    } catch (error) {
      throw new Error(`Failed to delete patient: ${(error as Error).message}`);
    }
  }

  async searchPatientsByName(name: string): Promise<PatientData[]> {
    try {
      if (!name || name.trim().length === 0) {
        throw new Error('Search name cannot be empty');
      }

      return await this.patientRepository.searchByName(name.trim());
    } catch (error) {
      throw new Error(`Failed to search patients: ${(error as Error).message}`);
    }
  }

  async searchPatientsByCedula(cedula: string): Promise<PatientData[]> {
    try {
      if (!cedula || cedula.trim().length < 2) {
        throw new Error('Search cedula must be at least 2 characters long');
      }

      return await this.patientRepository.searchByCedula(cedula.trim());
    } catch (error) {
      throw new Error(`Failed to search patients by cedula: ${(error as Error).message}`);
    }
  }

  async getPatientsByAgeRange(minAge: number, maxAge: number): Promise<PatientData[]> {
    try {
      if (minAge < 0 || maxAge < 0 || minAge > maxAge) {
        throw new Error('Invalid age range');
      }

      return await this.patientRepository.getPatientsByAgeRange(minAge, maxAge);
    } catch (error) {
      throw new Error(`Failed to get patients by age range: ${(error as Error).message}`);
    }
  }

  async getPatientStatistics(): Promise<{
    total: number;
    bySex: { Masculino: number; Femenino: number; Otro: number };
    byAgeGroup: { [key: string]: number };
  }> {
    try {
      const { data: allPatients } = await this.patientRepository.findAll({}, { page: 1, limit: 1000 });
      
      const stats = {
        total: allPatients.length,
        bySex: { Masculino: 0, Femenino: 0, Otro: 0 },
        byAgeGroup: {} as { [key: string]: number }
      };

      allPatients.forEach((patient: PatientData) => {
        // Count by sex
        if (patient.sexo === 'Masculino') stats.bySex.Masculino++;
        else if (patient.sexo === 'Femenino') stats.bySex.Femenino++;
        else stats.bySex.Otro++;

        // Count by age group
        const ageGroup = this.getAgeGroup(patient.edad);
        stats.byAgeGroup[ageGroup] = (stats.byAgeGroup[ageGroup] || 0) + 1;
      });

      return stats;
    } catch (error) {
      throw new Error(`Failed to get patient statistics: ${(error as Error).message}`);
    }
  }

  async getPatientsByMedico(medicoId: number, page: number = 1, limit: number = 100, filters: any = {}): Promise<{ patients: PatientData[], total: number }> {
    try {
      if (!medicoId || medicoId <= 0) {
        throw new Error('Valid medico ID is required');
      }

      console.log('🔍 Getting patients for medico_id:', medicoId, 'page:', page, 'limit:', limit, 'filters:', filters);

      // Always use the enhanced fallback query that includes both historico and consultas
      console.log('🔄 Using enhanced fallback query (includes historico + consultas)');
      const fallbackResult = await this.getPatientsByMedicoFallback(medicoId);
      
      // Apply pagination to the results
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPatients = fallbackResult.patients.slice(startIndex, endIndex);
      
      console.log('✅ Enhanced fallback result:', paginatedPatients.length, 'patients (page', page, 'of', Math.ceil(fallbackResult.total / limit), ')');
      return { 
        patients: paginatedPatients, 
        total: fallbackResult.total 
      };
    } catch (error) {
      console.error('❌ getPatientsByMedico error:', error);
      throw new Error(`Failed to get patients by medico: ${(error as Error).message}`);
    }
  }

  private async getPatientsByMedicoFallback(medicoId: number): Promise<{ patients: PatientData[], total: number }> {
    try {
      console.log('🔄 Using fallback query for medico_id:', medicoId);

      // PostgreSQL implementation with JOINs
      const client = await postgresPool.connect();
      try {
        const today = new Date().toISOString().split('T')[0];
        
        console.log('🔍 PostgreSQL query - medico_id:', medicoId, 'today:', today);
        
        // Query to get unique patients from both historico_pacientes and consultas_pacientes
        const result = await client.query(`
          SELECT DISTINCT p.*
          FROM pacientes p
          WHERE p.id IN (
            SELECT DISTINCT paciente_id 
            FROM historico_pacientes 
            WHERE medico_id = $1
            UNION
            SELECT DISTINCT paciente_id 
            FROM consultas_pacientes 
            WHERE medico_id = $1 
              AND fecha_pautada >= $2
              AND estado_consulta IN ('agendada', 'reagendada')
          )
          ORDER BY p.fecha_creacion DESC
        `, [medicoId, today]);

        console.log('✅ Fallback query result (PostgreSQL):', result.rows.length, 'unique patients');
        return { patients: result.rows, total: result.rows.length };
      } catch (dbError) {
        console.error('❌ PostgreSQL query error:', dbError);
        throw new Error(`Database query failed: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Fallback query error:', error);
      throw new Error(`Failed to get patients by medico (fallback): ${(error as Error).message}`);
    }
  }

  // Método específico para estadísticas (sin paginación)
  async getPatientsByMedicoForStats(medicoId: number | null = null): Promise<PatientData[]> {
    try {
      console.log('📊 Getting patients for statistics, medico_id:', medicoId);

      if (medicoId === null) {
        // For admin: get all patients directly from the patients table
        console.log('👑 Admin: Getting all patients for statistics');
        
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          const result = await client.query(
            'SELECT * FROM pacientes ORDER BY fecha_creacion DESC'
          );
          console.log('✅ Admin: Retrieved', result.rows.length, 'patients');
          return result.rows;
        } catch (dbError) {
          console.error('❌ PostgreSQL query error (admin):', dbError);
          throw new Error(`Database query failed: ${(dbError as Error).message}`);
        } finally {
          client.release();
        }
      } else {
        // For doctor: use the fallback query (which includes both historico and consultas)
        console.log('👨‍⚕️ Doctor: Getting patients for medico_id:', medicoId);
        
        const fallbackResult = await this.getPatientsByMedicoFallback(medicoId);
        return fallbackResult.patients;
      }
    } catch (error) {
      console.error('❌ getPatientsByMedicoForStats error:', error);
      throw new Error(`Failed to get patients by medico for stats: ${(error as Error).message}`);
    }
  }

  private getAgeGroup(age: number): string {
    if (age < 18) return '0-17';
    if (age < 30) return '18-29';
    if (age < 45) return '30-44';
    if (age < 60) return '45-59';
    if (age < 75) return '60-74';
    return '75+';
  }
}
