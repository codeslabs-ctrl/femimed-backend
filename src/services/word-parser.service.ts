import mammoth from 'mammoth';

export interface ParsedPatientData {
  nombres: string;
  apellidos: string;
  edad?: number;
  cedula?: string;
  email?: string;
  telefono?: string;
  sexo?: 'Masculino' | 'Femenino' | 'Otro';
  fur?: string; // Fecha Última Regla
  paridad?: string;
}

export interface ParsedHistoriaData {
  motivo_consulta?: string;
  antecedentes_personales?: string;
  antecedentes_familiares?: string;
  antecedentes_ginecoobstetricos?: string;
  antecedentes_quirurgicos?: string;
  examen_fisico?: string;
  ultrasonido?: string;
  diagnostico?: string;
  conclusiones?: string;
  plan?: string;
}

export interface ParsedMedicoData {
  nombres?: string;
  apellidos?: string;
  email?: string;
  especialidad?: string;
}

export interface ParsedDocumentData {
  paciente: ParsedPatientData;
  historia: ParsedHistoriaData;
  medico?: ParsedMedicoData;
  rawText: string;
}

export class WordParserService {
  /**
   * Convierte un archivo Word a texto plano
   */
  async extractTextFromWord(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Error extrayendo texto del documento: ${(error as Error).message}`);
    }
  }

  /**
   * Parsea el texto extraído del documento Word y extrae los datos estructurados
   */
  parseDocument(text: string, fileName?: string): ParsedDocumentData {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const fullText = text;

    // Extraer datos del paciente
    const paciente = this.extractPatientData(lines, fullText, fileName);

    // Extraer historia médica
    const historia = this.extractHistoriaData(lines, fullText);

    // Extraer datos del médico (si están disponibles)
    const medico = this.extractMedicoData(lines, fullText);

    // Construir el objeto resultado sin incluir medico si es undefined
    const result: ParsedDocumentData = {
      paciente,
      historia,
      rawText: fullText,
      ...(medico ? { medico } : {})
    };
    return result;
  }

  /**
   * Extrae datos del paciente del texto
   */
  private extractPatientData(_lines: string[], fullText: string, fileName?: string): ParsedPatientData {
    const paciente: ParsedPatientData = {
      nombres: '',
      apellidos: ''
    };

    // Buscar nombre en el nombre del archivo o en las primeras líneas
    if (fileName) {
      // El nombre del archivo puede ser el nombre del paciente
      const nameParts = fileName.replace('.docx', '').split(' ').filter(p => p.length > 0);
      if (nameParts.length >= 2 && nameParts[0]) {
        paciente.nombres = nameParts[0];
        paciente.apellidos = nameParts.slice(1).join(' ');
      }
    }

    // Buscar en el texto (puede ser "Nombre ADRIANA AGREDA" o similar)
    const nameMatch = fullText.match(/Nombre\s+([A-ZÁÉÍÓÚÑ\s]+?)(?:\s+Edad|\s+CI|\s+Cédula|\n)/i);
    if (nameMatch && nameMatch[1]) {
      const nameParts = nameMatch[1].trim().split(/\s+/).filter(p => p.length > 0);
      if (nameParts.length >= 1 && nameParts[0]) {
        paciente.nombres = nameParts[0];
        if (nameParts.length >= 2) {
          paciente.apellidos = nameParts.slice(1).join(' ');
        }
      }
    }
    
    // Si no encontramos apellidos en el texto pero sí en el nombre del archivo, usar ese
    if (!paciente.apellidos && fileName) {
      const nameParts = fileName.replace('.docx', '').replace('.doc', '').split(' ').filter(p => p.length > 0);
      if (nameParts.length >= 2) {
        paciente.apellidos = nameParts.slice(1).join(' ');
      }
    }

    // Extraer edad
    const edadMatch = fullText.match(/Edad\s+(\d+)\s*(años|año)?/i);
    if (edadMatch && edadMatch[1]) {
      paciente.edad = parseInt(edadMatch[1]);
    }

    // Extraer cédula (CI o Cédula) - puede tener formato "V- 24.801.037" o "V24801037"
    const cedulaMatch = fullText.match(/CI\s*[-:]?\s*([VvEeJjPpGg]-?\s*\d+[.\d\s]*)/i) || 
                       fullText.match(/Cédula\s*[-:]?\s*([VvEeJjPpGg]-?\s*\d+[.\d\s]*)/i);
    if (cedulaMatch && cedulaMatch[1]) {
      // Limpiar espacios y puntos, pero mantener el guión después de la letra
      paciente.cedula = cedulaMatch[1].replace(/\s+/g, '').replace(/\./g, '').toUpperCase();
    }

    // Extraer email (puede ser "CORREO. email@example.com" o "Email: email@example.com")
    const emailMatch = fullText.match(/CORREO\.?\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                      fullText.match(/Email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                      fullText.match(/email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch && emailMatch[1]) {
      paciente.email = emailMatch[1].trim();
    }

    // Extraer teléfono (puede tener formato "0414-2225888" o "04241234567")
    const telefonoMatch = fullText.match(/TLF\s*:?\s*([0-9-]+)/i) ||
                         fullText.match(/Teléfono\s*:?\s*([0-9-]+)/i) ||
                         fullText.match(/Telf\s*:?\s*([0-9-]+)/i) ||
                         fullText.match(/Teléf\s*:?\s*([0-9-]+)/i);
    if (telefonoMatch && telefonoMatch[1]) {
      paciente.telefono = telefonoMatch[1].trim();
    }

    // Determinar sexo basado en contexto (ginecología sugiere Femenino)
    if (fullText.toLowerCase().includes('ginecológica') || 
        fullText.toLowerCase().includes('gineco') ||
        fullText.toLowerCase().includes('menarquia') ||
        fullText.toLowerCase().includes('femenino')) {
      paciente.sexo = 'Femenino';
    } else if (fullText.toLowerCase().includes('masculino')) {
      paciente.sexo = 'Masculino';
    }

    // Extraer FUR (Fecha Última Regla) - puede ser "05.09.2025" o "05/09/2025"
    const furMatch = fullText.match(/FUR\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
    if (furMatch && furMatch[1]) {
      // Convertir a formato YYYY-MM-DD
      const dateParts = furMatch[1].split(/[./]/);
      if (dateParts.length === 3 && dateParts[0] && dateParts[1] && dateParts[2]) {
        const day = dateParts[0].padStart(2, '0');
        const month = dateParts[1].padStart(2, '0');
        const year = dateParts[2];
        paciente.fur = `${year}-${month}-${day}`;
      } else {
        paciente.fur = furMatch[1].replace(/\//g, '-').replace(/\./g, '-');
      }
    }

    // Extraer paridad
    const paridadMatch = fullText.match(/Paridad\s*:?\s*([^\n]+)/i);
    if (paridadMatch && paridadMatch[1]) {
      paciente.paridad = paridadMatch[1].trim();
    }

    return paciente;
  }

  /**
   * Extrae los datos de la historia médica
   */
  private extractHistoriaData(_lines: string[], fullText: string): ParsedHistoriaData {
    const historia: ParsedHistoriaData = {};

    // Extraer motivo de consulta (puede estar en la misma línea o después de dos puntos)
    const motivoMatch = fullText.match(/MOTIVO\s+DE\s+CONSULTA\s*:?\s*([^\n_]+)/i);
    if (motivoMatch && motivoMatch[1]) {
      historia.motivo_consulta = motivoMatch[1].trim();
    }

    // Extraer antecedentes personales
    const antecedentesPersonalesMatch = fullText.match(/ANTECEDENTES\s+PERSONALES\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN)[^\n]+)*)/i);
    if (antecedentesPersonalesMatch && antecedentesPersonalesMatch[1]) {
      historia.antecedentes_personales = antecedentesPersonalesMatch[1].trim();
    }

    // Extraer antecedentes familiares
    const antecedentesFamiliaresMatch = fullText.match(/ANTECEDENTES\s+FAMILIARES\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN)[^\n]+)*)/i);
    if (antecedentesFamiliaresMatch && antecedentesFamiliaresMatch[1]) {
      historia.antecedentes_familiares = antecedentesFamiliaresMatch[1].trim();
    }

    // Extraer antecedentes ginecoobstétricos
    const antecedentesGinecoMatch = fullText.match(/ANTECEDENTES\s+GINECOOBSTETRICOS?\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN)[^\n]+)*)/i);
    if (antecedentesGinecoMatch && antecedentesGinecoMatch[1]) {
      historia.antecedentes_ginecoobstetricos = antecedentesGinecoMatch[1].trim();
    }

    // Extraer antecedentes quirúrgicos
    const antecedentesQuirurgicosMatch = fullText.match(/ANTECEDENTES\s+QUIRURGICOS?\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN)[^\n]+)*)/i);
    if (antecedentesQuirurgicosMatch && antecedentesQuirurgicosMatch[1]) {
      historia.antecedentes_quirurgicos = antecedentesQuirurgicosMatch[1].trim();
    }

    // Extraer examen físico
    const examenFisicoMatch = fullText.match(/EXAMEN\s+FISICO\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN|Ultrasonido)[^\n]+)*)/i);
    if (examenFisicoMatch && examenFisicoMatch[1]) {
      historia.examen_fisico = examenFisicoMatch[1].trim();
    }

    // Extraer ultrasonido
    const ultrasonidoMatch = fullText.match(/Ultrasonido[^\n]*(?:\n[^\n]+(?:\n(?!CONCLUSIONES|PLAN)[^\n]+)*)/i);
    if (ultrasonidoMatch) {
      historia.ultrasonido = ultrasonidoMatch[0].trim();
    }

    // Extraer conclusiones
    const conclusionesMatch = fullText.match(/CONCLUSIONES?\s*:?\s*([^\n]+(?:\n(?!PLAN)[^\n]+)*)/i);
    if (conclusionesMatch && conclusionesMatch[1]) {
      historia.conclusiones = conclusionesMatch[1].trim();
    }

    // Extraer plan
    const planMatch = fullText.match(/PLAN\s*:?\s*([^\n]+)/i);
    if (planMatch && planMatch[1]) {
      historia.plan = planMatch[1].trim();
    }

    // Construir diagnóstico combinando antecedentes y examen físico si no hay campo diagnóstico específico
    if (!historia.diagnostico) {
      const diagnosticoParts: string[] = [];
      if (historia.examen_fisico) diagnosticoParts.push(`Examen Físico: ${historia.examen_fisico}`);
      if (historia.ultrasonido) diagnosticoParts.push(`Ultrasonido: ${historia.ultrasonido}`);
      if (diagnosticoParts.length > 0) {
        historia.diagnostico = diagnosticoParts.join('\n\n');
      }
    }

    return historia;
  }

  /**
   * Extrae datos del médico (si están disponibles en el documento)
   */
  private extractMedicoData(_lines: string[], fullText: string): ParsedMedicoData | undefined {
    // Buscar firmas o nombres de médicos (esto puede variar según el formato)
    const medicoMatch = fullText.match(/Dr\.?\s*([A-ZÁÉÍÓÚÑ\s]+)/i) ||
                       fullText.match(/Médico\s*:?\s*([A-ZÁÉÍÓÚÑ\s]+)/i);

    if (medicoMatch && medicoMatch[1]) {
      const nameParts = medicoMatch[1].trim().split(/\s+/);
      if (nameParts.length >= 2 && nameParts[0]) {
        return {
          nombres: nameParts[0],
          apellidos: nameParts.slice(1).join(' ')
        };
      }
    }

    return undefined;
  }

  /**
   * Combina todos los antecedentes en un texto estructurado
   */
  formatHistoriaContent(historia: ParsedHistoriaData): string {
    const parts: string[] = [];

    if (historia.motivo_consulta) {
      parts.push(`<p><strong>Motivo de Consulta:</strong> ${historia.motivo_consulta}</p>`);
    }

    if (historia.antecedentes_personales) {
      parts.push(`<p><strong>Antecedentes Personales:</strong> ${historia.antecedentes_personales}</p>`);
    }

    if (historia.antecedentes_familiares) {
      parts.push(`<p><strong>Antecedentes Familiares:</strong> ${historia.antecedentes_familiares}</p>`);
    }

    if (historia.antecedentes_ginecoobstetricos) {
      parts.push(`<p><strong>Antecedentes Ginecoobstétricos:</strong> ${historia.antecedentes_ginecoobstetricos}</p>`);
    }

    if (historia.antecedentes_quirurgicos) {
      parts.push(`<p><strong>Antecedentes Quirúrgicos:</strong> ${historia.antecedentes_quirurgicos}</p>`);
    }

    if (historia.examen_fisico) {
      parts.push(`<p><strong>Examen Físico:</strong> ${historia.examen_fisico}</p>`);
    }

    if (historia.ultrasonido) {
      parts.push(`<p><strong>Ultrasonido:</strong> ${historia.ultrasonido}</p>`);
    }

    if (historia.diagnostico) {
      parts.push(`<p><strong>Diagnóstico:</strong> ${historia.diagnostico}</p>`);
    }

    if (historia.conclusiones) {
      parts.push(`<p><strong>Conclusiones:</strong> ${historia.conclusiones}</p>`);
    }

    if (historia.plan) {
      parts.push(`<p><strong>Plan:</strong> ${historia.plan}</p>`);
    }

    return parts.join('\n\n');
  }
}

