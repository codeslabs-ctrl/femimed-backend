import { AntecedenteTipoRepository, AntecedenteMedicoTipoData } from '../repositories/antecedente-tipo.repository.js';

export class AntecedenteTipoService {
  private repository: AntecedenteTipoRepository;

  constructor() {
    this.repository = new AntecedenteTipoRepository();
  }

  async getAll(): Promise<AntecedenteMedicoTipoData[]> {
    const { data } = await this.repository.findAll({}, { page: 1, limit: 1000 });
    return data;
  }

  async getByTipo(tipo: string, soloActivos = true): Promise<AntecedenteMedicoTipoData[]> {
    return this.repository.findByTipo(tipo, soloActivos);
  }

  async getById(id: number): Promise<AntecedenteMedicoTipoData | null> {
    return this.repository.findById(id);
  }

  async create(data: Omit<AntecedenteMedicoTipoData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>): Promise<AntecedenteMedicoTipoData> {
    return this.repository.create(data);
  }

  async update(id: number, data: Partial<AntecedenteMedicoTipoData>): Promise<AntecedenteMedicoTipoData> {
    return this.repository.update(id, data);
  }

  async delete(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }
}
