import { postgresPool } from '../config/database.js';

export interface AntecedenteTipoLabelRow {
  id: number;
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

export class AntecedentesTipoLabelRepository {
  async findActivosOrdenados(): Promise<AntecedenteTipoLabelRow[]> {
    const result = await postgresPool.query<AntecedenteTipoLabelRow>(
      `SELECT id, codigo, etiqueta, orden, activo
       FROM antecedentes_tipo_label
       WHERE activo = true
       ORDER BY orden ASC, id ASC`
    );
    return result.rows;
  }
}
