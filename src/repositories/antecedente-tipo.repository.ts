import { PostgresRepository } from './postgres.repository.js';

export interface AntecedenteMedicoTipoData {
  id?: number;
  tipo: string;
  nombre: string;
  requiere_detalle: string;
  orden: number;
  activo: boolean;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export class AntecedenteTipoRepository extends PostgresRepository<AntecedenteMedicoTipoData> {
  constructor() {
    super('antecedente_medico_tipo');
  }

  async findByTipo(tipo: string, soloActivos = true): Promise<AntecedenteMedicoTipoData[]> {
    const conditions = ['tipo = $1'];
    const values: any[] = [tipo];
    if (soloActivos) {
      conditions.push('activo = $2');
      values.push(true);
    }
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE ${conditions.join(' AND ')} ORDER BY orden ASC, id ASC`,
      values
    );
    return result.rows as AntecedenteMedicoTipoData[];
  }
}
