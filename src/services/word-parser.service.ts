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
  antecedentes_otros?: string;
  examen_fisico?: string;
  ultrasonido?: string;
  examenes_medico?: string; // Exámenes médicos consolidados
  diagnostico?: string;
  conclusiones?: string;
  plan?: string;
  fecha_consulta?: string; // Fecha extraída antes de "INFORME MEDICO:"
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
   * Usa convertToHtml primero para asegurar que se capture todo el contenido, incluyendo múltiples páginas
   */
  async extractTextFromWord(buffer: Buffer): Promise<string> {
    try {
      // Intentar primero con extractRawText
      const rawResult = await mammoth.extractRawText({ buffer });
      let text = rawResult.value;
      
      // Si el texto parece estar incompleto (menos de 100 caracteres), intentar con convertToHtml
      // Esto puede ayudar con documentos complejos o con múltiples páginas
      if (text.length < 100) {
        const htmlResult = await mammoth.convertToHtml({ buffer });
        // Extraer texto del HTML removiendo tags
        text = htmlResult.value
          .replace(/<[^>]*>/g, ' ') // Remover tags HTML
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // Log para debugging (puedes remover esto después)
      console.log(`📄 Texto extraído: ${text.length} caracteres`);
      
      return text;
    } catch (error) {
      throw new Error(`Error extrayendo texto del documento: ${(error as Error).message}`);
    }
  }

  /**
   * Divide el documento en hojas separadas usando "INFORME MEDICO:" como delimitador
   */
  splitDocumentIntoPages(text: string): string[] {
    // Dividir por "INFORME MEDICO:" o "INFORME MÉDICO:" (con acento)
    // Usar lookahead positivo para incluir "INFORME MEDICO:" al inicio de cada hoja
    const pages = text.split(/(?=INFORME\s+M[EÉ]DICO?:)/i);
    
    // Filtrar páginas vacías y devolver solo las que tienen contenido
    // También eliminar la primera página si está vacía (puede ocurrir si el documento empieza con "INFORME MEDICO:")
    const filteredPages = pages
      .map(page => page.trim())
      .filter(page => page.length > 0 && page.toLowerCase().includes('informe'));
    
    console.log(`📑 Documento dividido en ${filteredPages.length} hoja(s)`);
    filteredPages.forEach((page, index) => {
      const preview = page.substring(0, 150).replace(/\n/g, ' ');
      console.log(`  Hoja ${index + 1} (${page.length} caracteres): ${preview}...`);
    });
    
    return filteredPages;
  }

  /**
   * Extrae la fecha que está antes de "INFORME MEDICO:"
   * Formato esperado: "Caracas 16.11.2023" o similar
   * Nota: Cuando se divide el documento, cada hoja ya incluye "INFORME MEDICO:" al inicio
   * Por lo tanto, buscamos la fecha al inicio de la hoja o antes de "INFORME MEDICO:"
   */
  extractFechaConsulta(text: string): string | undefined {
    // Buscar patrón: ciudad/ubicación seguido de fecha
    // Ejemplos: "Caracas 16.11.2023", "Valencia 01/12/2024", etc.
    // Primero intentar buscar antes de "INFORME MEDICO:" (si está presente)
    let fechaMatch = text.match(/([A-ZÁÉÍÓÚÑ\s]+)\s+(\d{1,2}[./]\d{1,2}[./]\d{4})\s*INFORME\s+M[EÉ]DICO?:/i);
    
    // Si no se encuentra, buscar al inicio de la hoja (formato: "Ciudad DD.MM.YYYY")
    if (!fechaMatch) {
      fechaMatch = text.match(/^([A-ZÁÉÍÓÚÑ\s]+)\s+(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
    }
    
    // Si aún no se encuentra, buscar en cualquier parte del texto (formato más flexible)
    if (!fechaMatch) {
      fechaMatch = text.match(/([A-ZÁÉÍÓÚÑ\s]{3,})\s+(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
    }
    
    if (fechaMatch && fechaMatch[2]) {
      const fechaStr = fechaMatch[2];
      const ciudad = fechaMatch[1] ? fechaMatch[1].trim() : '';
      // Convertir a formato YYYY-MM-DD
      const dateParts = fechaStr.split(/[./]/);
      if (dateParts.length === 3 && dateParts[0] && dateParts[1] && dateParts[2]) {
        const day = dateParts[0].padStart(2, '0');
        const month = dateParts[1].padStart(2, '0');
        const year = dateParts[2];
        const fechaFormateada = `${year}-${month}-${day}`;
        console.log(`📅 Fecha extraída: "${ciudad} ${fechaStr}" -> ${fechaFormateada}`);
        return fechaFormateada;
      }
      const fechaFormateada = fechaStr.replace(/\./g, '-').replace(/\//g, '-');
      console.log(`📅 Fecha extraída (formato alternativo): ${fechaStr} -> ${fechaFormateada}`);
      return fechaFormateada;
    }
    
    console.warn('⚠️ No se pudo extraer la fecha de consulta del documento');
    return undefined;
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

    // Extraer fecha de consulta antes de "INFORME MEDICO:"
    const fechaConsulta = this.extractFechaConsulta(fullText);
    if (fechaConsulta) {
      historia.fecha_consulta = fechaConsulta;
    }

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

    // Extraer edad - formato: "Edad 26 años" o "Edad 26" o "Edad: 26 años"
    // Solo captura el valor numérico (el grupo de captura (\d+))
    const edadMatch = fullText.match(/Edad\s*:?\s*(\d+)\s*(años|año)?/i);
    if (edadMatch && edadMatch[1]) {
      // Solo guardar el valor numérico, no el texto completo
      paciente.edad = parseInt(edadMatch[1], 10);
      console.log(`📊 Edad extraída (solo número): ${paciente.edad}`);
    } else {
      console.warn('⚠️ No se pudo extraer la edad del documento');
    }

    // Extraer cédula (CI o Cédula) - puede tener formato "V- 24.801.037" o "V24801037"
    const cedulaMatch = fullText.match(/CI\s*[-:]?\s*([VvEeJjPpGg]-?\s*\d+[.\d\s]*)/i) || 
                       fullText.match(/Cédula\s*[-:]?\s*([VvEeJjPpGg]-?\s*\d+[.\d\s]*)/i);
    if (cedulaMatch && cedulaMatch[1]) {
      // Limpiar espacios y puntos, pero mantener el guión después de la letra
      paciente.cedula = cedulaMatch[1].replace(/\s+/g, '').replace(/\./g, '').toUpperCase();
    }

    // Extraer email - formato: "CORREO. email@example.com" o "Email: email@example.com"
    // El punto después de CORREO puede estar o no, y puede haber espacios
    const emailMatch = fullText.match(/CORREO\.?\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                      fullText.match(/Email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
                      fullText.match(/email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch && emailMatch[1]) {
      paciente.email = emailMatch[1].trim();
      console.log(`📧 Email extraído: ${paciente.email}`);
    } else {
      console.warn('⚠️ No se pudo extraer el email del documento');
    }

    // Extraer teléfono - formato: "TLF 0412.7085759" o "TLF 0414-2225888" o "04241234567"
    // Puede tener puntos, guiones o espacios
    const telefonoMatch = fullText.match(/TLF\s*:?\s*([0-9.\-\s]+)/i) ||
                         fullText.match(/Teléfono\s*:?\s*([0-9.\-\s]+)/i) ||
                         fullText.match(/Telf\s*:?\s*([0-9.\-\s]+)/i) ||
                         fullText.match(/Teléf\s*:?\s*([0-9.\-\s]+)/i);
    if (telefonoMatch && telefonoMatch[1]) {
      // Limpiar puntos y espacios, mantener solo números y guiones
      paciente.telefono = telefonoMatch[1].replace(/\./g, '').replace(/\s+/g, '').trim();
      console.log(`📱 Teléfono extraído: ${paciente.telefono}`);
    } else {
      console.warn('⚠️ No se pudo extraer el teléfono del documento');
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

    // Extraer motivo de consulta - captura hasta la siguiente sección (ANTECEDENTES, EXAMEN, etc.)
    const motivoMatch = fullText.match(/MOTIVO\s+DE\s+CONSULTA\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN|DIAGNÓSTICO|DIAGNOSTICO|Ultrasonido)[^\n]+)*)/i);
    if (motivoMatch && motivoMatch[1]) {
      historia.motivo_consulta = motivoMatch[1].trim();
    }

    // CONSOLIDAR TODOS LOS ANTECEDENTES EN antecedentes_otros
    // Buscar todas las secciones que empiecen con "ANTECEDENTES" (cualquier tipo)
    const allAntecedentesRegex = /ANTECEDENTES\s+([A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+)*)\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN|DIAGNÓSTICO|DIAGNOSTICO|Ultrasonido)[^\n]+)*)/gi;
    const antecedentesSections: string[] = [];
    let match;
    
    while ((match = allAntecedentesRegex.exec(fullText)) !== null) {
      const tipoAntecedente = match[1]?.trim();
      const contenido = match[2]?.trim();
      
      if (tipoAntecedente && contenido) {
        console.log(`[WordParser] Antecedentes encontrado - Tipo: "${tipoAntecedente}", Contenido: "${contenido?.substring(0, 50)}..."`);
        antecedentesSections.push(`${tipoAntecedente}: ${contenido}`);
      }
    }
    
    // Consolidar todos los antecedentes en antecedentes_otros
    if (antecedentesSections.length > 0) {
      historia.antecedentes_otros = antecedentesSections.join('\n\n');
      console.log(`[WordParser] Todos los antecedentes consolidados en antecedentes_otros (${antecedentesSections.length} secciones)`);
    }

    // EXTRAER EXÁMENES MÉDICOS (Examen Físico, Ultrasonido, etc.)
    const examenesMedicos: string[] = [];
    
    // Extraer examen físico
    const examenFisicoMatch = fullText.match(/EXAMEN\s+FISICO\s*:?\s*([^\n]+(?:\n(?!ANTECEDENTES|EXAMEN|CONCLUSIONES|PLAN|DIAGNÓSTICO|DIAGNOSTICO|Ultrasonido|DIAGNOSTICO)[^\n]+)*)/i);
    if (examenFisicoMatch && examenFisicoMatch[1]) {
      const examenFisico = examenFisicoMatch[1].trim();
      historia.examen_fisico = examenFisico;
      examenesMedicos.push(`Examen Físico: ${examenFisico}`);
    }

    // Extraer ultrasonido
    const ultrasonidoMatch = fullText.match(/Ultrasonido[^\n]*(?:\n[^\n]+(?:\n(?!CONCLUSIONES|PLAN|DIAGNÓSTICO|DIAGNOSTICO)[^\n]+)*)/i);
    if (ultrasonidoMatch) {
      const ultrasonido = ultrasonidoMatch[0].trim();
      historia.ultrasonido = ultrasonido;
      examenesMedicos.push(ultrasonido);
    }

    // Consolidar todos los exámenes médicos en examenes_medico
    if (examenesMedicos.length > 0) {
      historia.examenes_medico = examenesMedicos.join('\n\n');
      console.log(`[WordParser] Exámenes médicos consolidados (${examenesMedicos.length} secciones)`);
    }

    // EXTRAER DIAGNÓSTICO (solo la sección DIAGNÓSTICO, no los exámenes)
    const diagnosticoMatch = fullText.match(/DIAGNÓSTICO\s*:?\s*([^\n]+(?:\n(?!CONCLUSIONES|PLAN|EXAMEN|Ultrasonido)[^\n]+)*)/i) ||
                             fullText.match(/DIAGNOSTICO\s*:?\s*([^\n]+(?:\n(?!CONCLUSIONES|PLAN|EXAMEN|Ultrasonido)[^\n]+)*)/i);
    if (diagnosticoMatch && diagnosticoMatch[1]) {
      historia.diagnostico = diagnosticoMatch[1].trim();
      console.log(`[WordParser] Diagnóstico extraído: "${historia.diagnostico.substring(0, 100)}..."`);
    }

    // Extraer conclusiones
    const conclusionesContentMatch = fullText.match(/CONCLUSIONES?\s*:?\s*([^\n]+(?:\n(?!PLAN)[^\n]+)*)/i);
    if (conclusionesContentMatch && conclusionesContentMatch[1]) {
      historia.conclusiones = conclusionesContentMatch[1].trim();
    }

    // Extraer plan
    const planMatch = fullText.match(/PLAN\s*:?\s*([^\n]+)/i);
    if (planMatch && planMatch[1]) {
      historia.plan = planMatch[1].trim();
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

