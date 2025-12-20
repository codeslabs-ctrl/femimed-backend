import { postgresPool } from '../config/database.js';
import { getCurrentClinica } from '../middleware/clinica.middleware';

export interface Clinica {
  id: number;
  alias: string;
  nombre_clinica: string;
  descripcion?: string;
  activa: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface MedicoClinica {
  id: number;
  medico_id: number;
  clinica_alias: string;
  activo: boolean;
  fecha_asignacion: string;
}

export interface EspecialidadClinica {
  id: number;
  especialidad_id: number;
  clinica_alias: string;
  activa: boolean;
  fecha_asignacion: string;
}

export class ClinicaService {
  /**
   * Obtener información de la clínica actual
   */
  async getCurrentClinicaInfo(): Promise<Clinica | null> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM clinicas WHERE alias = $1 AND activa = true LIMIT 1',
          [clinicaAlias]
        );

        if (result.rows.length === 0) {
          return null;
        }

        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en getCurrentClinicaInfo:', error);
      return null;
    }
  }

  /**
   * Obtener médicos asignados a la clínica actual
   */
  async getMedicosByClinica(): Promise<any[]> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT 
            mc.*,
            m.id as medico_id,
            m.nombres,
            m.apellidos,
            m.email,
            m.telefono,
            m.especialidad_id
          FROM medicos_clinicas mc
          INNER JOIN medicos m ON mc.medico_id = m.id
          WHERE mc.clinica_alias = $1 AND mc.activo = true`,
          [clinicaAlias]
        );

        // Formatear para compatibilidad con el código existente
        return result.rows.map(row => ({
          ...row,
          medicos: {
            id: row.medico_id,
            nombres: row.nombres,
            apellidos: row.apellidos,
            email: row.email,
            telefono: row.telefono,
            especialidad_id: row.especialidad_id
          }
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en getMedicosByClinica:', error);
      return [];
    }
  }

  /**
   * Obtener especialidades disponibles en la clínica actual
   */
  async getEspecialidadesByClinica(): Promise<any[]> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT 
            ec.*,
            e.id as especialidad_id,
            e.nombre_especialidad,
            e.descripcion
          FROM especialidades_clinicas ec
          INNER JOIN especialidades e ON ec.especialidad_id = e.id
          WHERE ec.clinica_alias = $1 AND ec.activa = true`,
          [clinicaAlias]
        );

        // Formatear para compatibilidad con el código existente
        return result.rows.map(row => ({
          ...row,
          especialidades: {
            id: row.especialidad_id,
            nombre_especialidad: row.nombre_especialidad,
            descripcion: row.descripcion
          }
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en getEspecialidadesByClinica:', error);
      return [];
    }
  }

  /**
   * Verificar que un médico pertenece a la clínica actual
   */
  async verifyMedicoClinica(medicoId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT id FROM medicos_clinicas WHERE medico_id = $1 AND clinica_alias = $2 AND activo = true LIMIT 1',
          [medicoId, clinicaAlias]
        );

        return result.rows.length > 0;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en verifyMedicoClinica:', error);
      return false;
    }
  }

  /**
   * Verificar que una especialidad está disponible en la clínica actual
   */
  async verifyEspecialidadClinica(especialidadId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT id FROM especialidades_clinicas WHERE especialidad_id = $1 AND clinica_alias = $2 AND activo = true LIMIT 1',
          [especialidadId, clinicaAlias]
        );

        return result.rows.length > 0;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en verifyEspecialidadClinica:', error);
      return false;
    }
  }

  /**
   * Asignar médico a la clínica actual
   */
  async asignarMedicoClinica(medicoId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        await client.query(
          'INSERT INTO medicos_clinicas (medico_id, clinica_alias, activo) VALUES ($1, $2, true)',
          [medicoId, clinicaAlias]
        );

        return true;
      } catch (error) {
        console.error('Error asignando médico a clínica:', error);
        return false;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en asignarMedicoClinica:', error);
      return false;
    }
  }

  /**
   * Asignar especialidad a la clínica actual
   */
  async asignarEspecialidadClinica(especialidadId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        await client.query(
          'INSERT INTO especialidades_clinicas (especialidad_id, clinica_alias, activa) VALUES ($1, $2, true)',
          [especialidadId, clinicaAlias]
        );

        return true;
      } catch (error) {
        console.error('Error asignando especialidad a clínica:', error);
        return false;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en asignarEspecialidadClinica:', error);
      return false;
    }
  }

  /**
   * Crear filtro automático por clínica para cualquier tabla
   */
  createClinicaFilter() {
    const clinicaAlias = getCurrentClinica();
    return {
      clinica_alias: clinicaAlias
    };
  }
}
