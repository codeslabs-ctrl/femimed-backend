import { PostgresRepository } from './postgres.repository.js';

export interface PatientData {
  id?: number;
  nombres: string;
  apellidos: string;
  cedula?: string;
  edad: number;
  sexo: 'Masculino' | 'Femenino' | 'Otro';
  email?: string;
  telefono?: string;
  medico_id?: number;
  motivo_consulta?: string;
  diagnostico?: string;
  conclusiones?: string;
  plan?: string;
  antecedentes_medicos?: string;
  medicamentos?: string;
  alergias?: string;
  observaciones?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

// Implementación con PostgreSQL
export class PatientRepository extends PostgresRepository<PatientData> {
  constructor() {
    super('pacientes');
  }

  async findByEmail(email: string): Promise<PatientData | null> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE email = $1 LIMIT 1`,
      [email]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async searchByName(name: string): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE nombres ILIKE $1 OR apellidos ILIKE $1 ORDER BY id DESC`,
      [`%${name}%`]
    );
    return result.rows;
  }

  async searchByCedula(cedula: string): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE cedula ILIKE $1 ORDER BY id DESC`,
      [`%${cedula}%`]
    );
    return result.rows;
  }

  async getPatientsByAgeRange(minAge: number, maxAge: number): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE edad >= $1 AND edad <= $2 ORDER BY id DESC`,
      [minAge, maxAge]
    );
    return result.rows;
  }

  async getPatientsBySex(sexo: 'Masculino' | 'Femenino' | 'Otro'): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE sexo = $1 ORDER BY id DESC`,
      [sexo]
    );
    return result.rows;
  }
}

// Exportar el tipo para uso en TypeScript
export type PatientRepositoryType = typeof PatientRepository;
