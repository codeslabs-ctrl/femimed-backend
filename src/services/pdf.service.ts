import puppeteer from 'puppeteer';
import { postgresPool } from '../config/database.js';
import * as fs from 'fs';
import * as path from 'path';
import { FirmaService } from './firma.service.js';

export class PDFService {
  private firmaService: FirmaService;
  
  constructor() {
    this.firmaService = new FirmaService();
  }
  
  /**
   * Genera un PDF de un informe médico
   * @param informeId ID del informe médico
   * @returns Buffer del PDF generado
   */
  async generarPDFInforme(informeId: number): Promise<Buffer> {
    let browser: any = null;
    const client = await postgresPool.connect();
    
    try {
      console.log(`🔄 Generando PDF para informe ${informeId}`);
      
      // Obtener el informe con datos básicos del médico y paciente (PostgreSQL)
      let informe: any;
      try {
        const result = await client.query(
          `SELECT 
            i.*,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            m.especialidad_id,
            e.nombre_especialidad,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.cedula as paciente_cedula,
            p.edad as paciente_edad
          FROM informes_medicos i
          LEFT JOIN medicos m ON i.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          LEFT JOIN pacientes p ON i.paciente_id = p.id
          WHERE i.id = $1
          LIMIT 1`,
          [informeId]
        );

        if (result.rows.length === 0) {
          console.error('❌ No se encontró informe con ID:', informeId);
          throw new Error('Informe no encontrado');
        }

        informe = result.rows[0];
        // Formatear para compatibilidad con el código existente
        informe.medicos = {
          nombres: informe.medico_nombres,
          apellidos: informe.medico_apellidos,
          especialidad: informe.nombre_especialidad || 'Medicina General'
        };
        
        // Obtener edad del paciente (directamente de la columna edad o calcular si no existe)
        let edad = '';
        try {
          // Primero intentar usar la columna edad directamente
          if (informe.paciente_edad !== null && informe.paciente_edad !== undefined) {
            edad = informe.paciente_edad.toString();
          }
        } catch (edadError: any) {
          console.warn('⚠️ Error obteniendo edad del paciente:', edadError.message);
          edad = '';
        }
        
        // Datos del paciente para la línea descriptiva (siempre definir, incluso si está vacío)
        informe.paciente = {
          nombres: informe.paciente_nombres || '',
          apellidos: informe.paciente_apellidos || '',
          cedula: informe.paciente_cedula || '',
          edad: edad
        };
        
        console.log('👤 Datos del paciente para PDF:', {
          nombres: informe.paciente.nombres,
          apellidos: informe.paciente.apellidos,
          cedula: informe.paciente.cedula,
          edad: informe.paciente.edad
        });
      } catch (dbError: any) {
        console.error('❌ Error obteniendo informe de la base de datos:', dbError);
        throw new Error(`Error obteniendo informe: ${dbError.message}`);
      } finally {
        client.release();
      }

      console.log('✅ Informe encontrado:', {
        id: informe.id,
        numero_informe: informe.numero_informe,
        medico_id: informe.medico_id,
        titulo: informe.titulo
      });

      // Obtener firma digital del médico
      let firmaBase64 = '';
      try {
        firmaBase64 = await this.firmaService.obtenerFirmaBase64(informe.medico_id);
        console.log('✅ Firma obtenida:', firmaBase64 ? 'Presente' : 'No disponible');
      } catch (firmaError: any) {
        console.warn('⚠️ Error obteniendo firma (continuando sin firma):', firmaError.message);
        firmaBase64 = '';
      }
      
      // Generar HTML para el PDF
      let htmlContent = '';
      try {
        console.log('🔄 Generando HTML para PDF...');
        console.log('📋 Informe recibido:', {
          id: informe.id,
          tienePaciente: !!informe.paciente,
          pacienteNombres: informe.paciente?.nombres,
          pacienteApellidos: informe.paciente?.apellidos,
          pacienteCedula: informe.paciente?.cedula,
          pacienteEdad: informe.paciente?.edad
        });
        htmlContent = await this.generarHTMLParaPDF(informe, firmaBase64);
        console.log('✅ HTML generado, tamaño:', htmlContent.length, 'caracteres');
      } catch (htmlError: any) {
        console.error('❌ Error generando HTML:', htmlError);
        console.error('❌ Stack trace:', htmlError.stack);
        throw new Error(`Error generando HTML para PDF: ${htmlError.message}`);
      }
      
      // Configurar Puppeteer
      try {
        console.log('🔄 Iniciando Puppeteer...');
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
          ],
          timeout: 60000
        });
        console.log('✅ Puppeteer iniciado correctamente');
      } catch (puppeteerError: any) {
        console.error('❌ Error iniciando Puppeteer:', puppeteerError);
        throw new Error(`Error iniciando navegador: ${puppeteerError.message}`);
      }
      
      let page: any = null;
      try {
        page = await browser.newPage();
        
        // Configurar timeouts más largos
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);
        
        // Establecer el contenido HTML
        console.log('🔄 Estableciendo contenido HTML...');
        await page.setContent(htmlContent, {
          waitUntil: 'load',
          timeout: 60000
        });
        console.log('✅ Contenido HTML establecido');
        
        // Esperar un poco más para asegurar que todo esté renderizado
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ Espera adicional completada');
        
        // Verificar que la página sigue conectada
        if (page.isClosed()) {
          throw new Error('La página se cerró antes de generar el PDF');
        }
        
        // Generar PDF
        let pdfBuffer: Buffer;
        console.log('🔄 Generando PDF...');
        const pdf = await Promise.race([
          page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              // Márgenes más compactos para minimizar páginas extra
              top: '12mm',
              right: '12mm',
              bottom: '12mm',
              left: '12mm'
            },
            preferCSSPageSize: false
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout generando PDF')), 60000)
          )
        ]) as Buffer;
        
        pdfBuffer = Buffer.from(pdf);
        console.log('✅ PDF generado, tamaño:', pdfBuffer.length, 'bytes');
        
        // Cerrar la página antes de cerrar el navegador
        await page.close();
        page = null;
        
        // Cerrar el navegador después de generar el PDF
        await browser.close();
        browser = null;
        console.log('✅ Navegador cerrado correctamente');
        
        console.log(`✅ PDF generado exitosamente para informe ${informeId}`);
        return pdfBuffer;
      } catch (contentError: any) {
        console.error('❌ Error en proceso de generación:', contentError);
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (e) {
            console.warn('⚠️ Error cerrando página:', e);
          }
        }
        throw new Error(`Error generando PDF: ${contentError.message}`);
      }
      
      
    } catch (error: any) {
      console.error('❌ Error generando PDF:', error);
      console.error('Stack trace:', error.stack);
      
      // Asegurar que el navegador se cierre en caso de error
      if (browser) {
        try {
          const pages = await browser.pages();
          for (const p of pages) {
            if (!p.isClosed()) {
              await p.close();
            }
          }
          await browser.close();
          console.log('✅ Navegador cerrado correctamente después del error');
        } catch (closeError) {
          console.error('⚠️ Error cerrando navegador:', closeError);
        }
      }
      
      throw error;
    }
  }


  /**
   * Genera el HTML para el PDF
   */
  private async generarHTMLParaPDF(informe: any, firmaBase64: string = ''): Promise<string> {
    const fechaEmision = new Date(informe.fecha_emision).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

      // Obtener configuración de la clínica
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'default';
      const clinicaConfig = await this.obtenerConfiguracionClinica(clinicaAlias);
      
      // Convertir logo a base64
      const logoBase64 = await this.obtenerLogoBase64(clinicaConfig.logoPath);
      clinicaConfig.logo = logoBase64;
      
      console.log('🔧 Configuración de clínica:', {
        alias: clinicaAlias,
        logoPath: clinicaConfig.logoPath,
        logoBase64: logoBase64 ? '✅ Cargado' : '❌ No encontrado',
        nombre: clinicaConfig.nombre,
        logoSize: logoBase64 ? `${Math.round(logoBase64.length / 1024)}KB` : 'N/A'
      });

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Informe Médico - ${informe.numero_informe}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.4;
            color: #333;
            background: white;
            font-size: 11pt;
          }
          
                 .page {
                   max-width: 210mm;
                   margin: 0 auto;
                   /* Evitar doble-espaciado (márgenes PDF + padding HTML) que fuerza páginas extra */
                   padding: 0;
                   background: white;
                 }
                 
                 .header {
                   text-align: center;
                   margin-bottom: 4px;
                   border-bottom: none;
                   padding-bottom: 4px;
                   break-inside: avoid;
                 }
          
                 .logo {
                   /* Un poco más grande para mejor legibilidad en PDF */
                   width: 110px;
                   height: 110px;
                   margin: 0 auto 6px;
                   display: block;
                   object-fit: contain;
                   break-inside: avoid;
                 }
          
          .clinic-info {
            font-size: 9pt;
            color: #666;
            margin-bottom: 8px;
            line-height: 1.3;
          }
          
          .document-title {
            font-size: 14pt;
            font-weight: bold;
            color: #E91E63;
            margin-bottom: 5px;
          }
          
          .document-number {
            font-size: 10pt;
            color: #666;
          }
          
          .content {
            margin: 10px 0;
            text-align: justify;
          }
          
          .content h2 {
            color: #E91E63;
            margin: 10px 0 6px 0;
            font-size: 12pt;
            font-weight: bold;
            border-bottom: 1px solid #E91E63;
            padding-bottom: 2px;
            break-after: avoid;
            break-inside: avoid;
          }
          
          .content h3 {
            color: #333;
            margin: 8px 0 5px 0;
            font-size: 11pt;
            font-weight: bold;
            break-after: avoid;
            break-inside: avoid;
          }
          
          .content p {
            margin-bottom: 6px;
            text-indent: 15px;
            line-height: 1.4;
            orphans: 3;
            widows: 3;
          }
          
          .patient-data {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 20px;
            margin: 10px 0;
            padding: 12px;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-left: 3px solid #E91E63;
            font-size: 10pt;
          }
          
          .patient-data-item {
            display: flex;
            flex-direction: column;
          }
          
          .patient-data-label {
            font-weight: bold;
            color: #E91E63;
            font-size: 9pt;
            margin-bottom: 2px;
          }
          
          .patient-data-value {
            color: #333;
            font-size: 10pt;
          }
          
          .informe-content {
            display: block;
            margin: 10px 0;
            padding: 12px;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-left: 3px solid #E91E63;
            font-size: 10pt;
            line-height: 1.4;
          }
          
          .signature-section {
            margin-top: 22px;
            text-align: center;
            break-inside: avoid;
          }
          
          .signature-line {
            border-bottom: 1px solid #333;
            width: 150px;
            margin: 18px auto 5px;
            height: 1px;
          }
          
          .signature-image-container {
            margin: 20px auto;
            text-align: center;
          }
          
          .signature-image {
            max-width: 200px;
            max-height: 100px;
            border: 1px solid #ddd;
            background: white;
            padding: 5px;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          
          .signature-text {
            font-size: 9pt;
            color: #666;
            margin-top: 3px;
          }
          
          .date-section {
            text-align: right;
            margin-top: 12px;
            font-size: 9pt;
            color: #666;
          }
          
          .footer {
            margin-top: 18px;
            text-align: center;
            font-size: 8pt;
            color: #999;
            border-top: 1px solid #eee;
            padding-top: 8px;
            break-inside: avoid;
          }
          
          @media print {
            .page {
              margin: 0;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="logo-section">
                     ${clinicaConfig.logo ? 
                       `<img src="${clinicaConfig.logo}" alt="${clinicaConfig.nombre} Logo" class="logo">` :
                       `<div class="logo-fallback" style="width: 110px; height: 110px; background: ${clinicaConfig.color}; border-radius: 6px; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; color: white; font-size: 36px; font-weight: bold; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">${clinicaConfig.nombre.charAt(0)}</div>`
                     }
              <div class="clinic-info">
                ${clinicaConfig.descripcion}<br>
                ${clinicaConfig.especialidad}
              </div>
            </div>
            
            <div class="document-title">Informe Médico</div>
            <div class="document-number">N° ${informe.numero_informe}</div>
          </div>
          
          <div class="content">
            ${this.procesarContenidoInforme(informe.contenido, informe)}
          </div>
          
          <div class="signature-section">
            ${firmaBase64 ? `
              <div class="signature-image-container">
                <img src="${firmaBase64}" alt="Firma Digital" class="signature-image">
              </div>
            ` : `
              <div class="signature-line"></div>
            `}
            <div class="signature-text">
              <strong>Dr. ${informe.medicos?.nombres || ''} ${informe.medicos?.apellidos || ''}</strong><br>
              ${informe.medicos?.especialidad ? `Especialista en ${informe.medicos.especialidad}` : 'Médico'}
            </div>
          </div>
          
          <div class="date-section">
            <p><strong>Fecha de emisión:</strong> ${fechaEmision}</p>
          </div>
          
          <div class="footer">
            <p>Este documento ha sido generado digitalmente y es válido sin firma autógrafa</p>
            <p>${clinicaConfig.nombre} - ${clinicaConfig.descripcion}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Procesa el contenido del informe para aplicar estilos
   * Mantiene el orden original del contenido sin duplicar datos
   * Agrega línea descriptiva del paciente antes del Motivo de Consulta
   */
  private procesarContenidoInforme(contenido: string, informe: any): string {
    try {
      if (!contenido) {
        console.warn('⚠️ Contenido vacío recibido en procesarContenidoInforme');
        return '<div class="informe-content"><p>No hay contenido disponible.</p></div>';
      }
      
      let contenidoProcesado = contenido;
    
    // Remover secciones "Datos del Paciente" y "Datos del Médico" si existen
    // ya que estos datos no deben aparecer en el PDF (solo la firma del médico)
    // Mantener el resto del contenido en su orden original
    
    // Remover "Datos del Paciente" (desde el h2 hasta el siguiente h2, h3, hr o div)
    contenidoProcesado = contenidoProcesado.replace(
      /<h2>Datos del Paciente<\/h2>[\s\S]*?(?=<h2>Datos del Médico|<h2>|<h3>|<hr>|<div class="historia-seccion">|<div class="antecedentes-seccion">|$)/gi,
      ''
    );

    // Remover "Datos del Médico" (desde el h2 hasta el siguiente h2, h3, hr o div)
    contenidoProcesado = contenidoProcesado.replace(
      /<h2>Datos del Médico<\/h2>[\s\S]*?(?=<h2>|<h3>|<hr>|<div class="historia-seccion">|<div class="antecedentes-seccion">|$)/gi,
      ''
    );
    
    // Limpiar múltiples <hr> consecutivos que puedan quedar
    contenidoProcesado = contenidoProcesado.replace(/(<hr>\s*){2,}/gi, '<hr>');
    
    // Limpiar espacios en blanco excesivos
    contenidoProcesado = contenidoProcesado.replace(/\n{3,}/g, '\n\n');
    
    // Construir línea descriptiva del paciente
    let lineaDescriptiva = '';
    try {
      if (informe && informe.paciente) {
        const partes: string[] = [];
        
        // Nombre completo
        const nombreCompleto = `${informe.paciente.nombres || ''} ${informe.paciente.apellidos || ''}`.trim();
        if (nombreCompleto) {
          partes.push(nombreCompleto);
        }
        
        // Cédula
        if (informe.paciente.cedula) {
          partes.push(`cédula de identidad ${informe.paciente.cedula}`);
        }
        
        // Construir descripción
        const descripcion: string[] = ['paciente'];
        if (informe.paciente.edad) {
          descripcion.push(`de ${informe.paciente.edad} años de edad`);
        }
        
        // Unir todo
        if (partes.length > 0) {
          lineaDescriptiva = `${partes.join(', ')}, ${descripcion.join(' ')}.`;
        } else if (descripcion.length > 1) {
          lineaDescriptiva = `${descripcion.join(' ')}.`;
        }
      }
    } catch (error: any) {
      console.warn('⚠️ Error construyendo línea descriptiva del paciente:', error.message);
      lineaDescriptiva = '';
    }
    
    // Agregar línea descriptiva antes del "Motivo de Consulta" si existe
    if (lineaDescriptiva) {
      // Buscar la primera ocurrencia de "Motivo de Consulta"
      const motivoIndex = contenidoProcesado.search(/<h3><strong>Motivo de Consulta:/i);
      if (motivoIndex !== -1) {
        // Buscar hacia atrás desde el Motivo de Consulta para encontrar y eliminar <hr> cercanos
        const antesDeMotivo = contenidoProcesado.slice(0, motivoIndex);
        const despuesDeMotivo = contenidoProcesado.slice(motivoIndex);
        
        // Eliminar <hr> y espacios en blanco justo antes del Motivo de Consulta
        const antesLimpio = antesDeMotivo.replace(/(<hr[^>]*>\s*)+$/i, '').trimEnd();
        
        // Insertar la línea descriptiva antes del Motivo de Consulta
        contenidoProcesado = antesLimpio + 
                            (antesLimpio ? '\n' : '') +
                            `<p>${lineaDescriptiva}</p>` + 
                            '\n' +
                            despuesDeMotivo;
      } else {
        // Si no hay Motivo de Consulta, agregar al inicio (eliminando <hr> iniciales)
        const inicioLimpio = contenidoProcesado.replace(/^(<hr[^>]*>\s*)+/i, '');
        contenidoProcesado = `<p>${lineaDescriptiva}</p>` + '\n' + inicioLimpio;
      }
    }
    
    // Envolver TODO el contenido del informe en un solo contenedor
    contenidoProcesado = `<div class="informe-content">${contenidoProcesado}</div>`;
    
    return contenidoProcesado;
    } catch (error: any) {
      console.error('❌ Error en procesarContenidoInforme:', error);
      console.error('❌ Stack trace:', error.stack);
      // Retornar contenido mínimo en caso de error
      return '<div class="informe-content"><p>Error procesando el contenido del informe.</p></div>';
    }
  }

  // Eliminado: formatearDatosPaciente (ya no se usa)


  // Eliminado: extraerValor (ya no se usa)

  /**
   * Convierte el logo a base64
   */
  private async obtenerLogoBase64(logoPath: string): Promise<string> {
    try {
      if (!logoPath) {
        console.warn('⚠️ No se proporcionó ruta de logo');
        return '';
      }

      // Resolver rutas relativas desde la raíz del backend.
      // En runtime compilado, __dirname apunta a dist/services/, por eso subimos 2 niveles para llegar a dist/
      const distRoot = path.join(__dirname, '..', '..'); // dist/ cuando está compilado
      const projectRoot = path.join(distRoot, '..'); // raíz del proyecto

      const resolveFromRoot = (p: string, root: string): string => {
        if (path.isAbsolute(p)) return p;
        return path.resolve(root, p);
      };

      // Candidatos (fallback): primero dist/assets/ (cuando está compilado), luego assets/ (desarrollo)
      const candidates: string[] = [];

      // Cuando está compilado, los assets están en dist/assets/
      const normalized = logoPath.replace(/\\/g, '/');
      if (normalized.startsWith('./assets/')) {
        // Buscar primero en dist/assets/ (cuando está compilado)
        candidates.push(resolveFromRoot(normalized.replace('./assets/', './dist/assets/'), distRoot));
        // Luego en assets/ desde la raíz del proyecto (desarrollo)
        candidates.push(resolveFromRoot(logoPath, projectRoot));
      } else if (normalized.startsWith('assets/')) {
        // Buscar primero en dist/assets/ (cuando está compilado)
        candidates.push(resolveFromRoot('dist/' + logoPath, distRoot));
        // Luego en assets/ desde la raíz del proyecto (desarrollo)
        candidates.push(resolveFromRoot(logoPath, projectRoot));
      } else {
        // Ruta absoluta o relativa sin prefijo assets/
        candidates.push(resolveFromRoot(logoPath, distRoot));
        candidates.push(resolveFromRoot(logoPath, projectRoot));
      }

      for (const candidate of candidates) {
        console.log('🔍 Buscando logo en:', candidate);
        if (!fs.existsSync(candidate)) continue;

        const logoBuffer = fs.readFileSync(candidate);
        const base64 = logoBuffer.toString('base64');
        const ext = path.extname(candidate).toLowerCase();
        const mimeType =
          ext === '.svg' ? 'image/svg+xml' :
          ext === '.webp' ? 'image/webp' :
          ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
          'image/png';

        console.log('✅ Logo cargado correctamente, tipo:', mimeType);
        return `data:${mimeType};base64,${base64}`;
      }

      console.warn('⚠️ Logo no encontrado. Se intentó:', candidates);
      console.warn('⚠️ Continuando sin logo');
    } catch (error: any) {
      console.warn('⚠️ Error leyendo logo (continuando sin logo):', error.message);
    }
    return '';
  }

  /**
   * Obtiene la configuración específica de la clínica
   */
  private async obtenerConfiguracionClinica(clinicaAlias: string): Promise<any> {
    // Obtener la URL base del frontend desde variables de entorno
    const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:4200';
    
    const configuraciones: { [key: string]: any } = {
      'femimed': {
        nombre: process.env['CLINICA_NOMBRE'] || 'FemiMed',
        descripcion: process.env['CLINICA_DESCRIPCION'] || 'Centro Médico Especializado',
        especialidad: 'Ginecología y Obstetricia',
        color: '#E91E63',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/femimed/logo.svg',
        logo: '' // Se llenará con base64
      },
      'FemiMed': {
        nombre: process.env['CLINICA_NOMBRE'] || 'FemiMed',
        descripcion: process.env['CLINICA_DESCRIPCION'] || 'Centro Médico de Demostración',
        especialidad: 'Medicina General',
        color: '#2196F3',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/clinica/logo.webp',
        logo: '' // Se llenará con base64
      },
      'clinica2': {
        nombre: 'Clínica San José',
        descripcion: 'Centro de Salud Integral',
        especialidad: 'Medicina General',
        color: '#2196F3',
        logo: `${frontendUrl}/assets/logos/clinica2/logo.svg`
      },
      'default': {
        nombre: 'Centro Médico',
        descripcion: 'Servicios de Salud',
        especialidad: 'Medicina General',
        color: '#666666',
        logo: `${frontendUrl}/assets/logos/default/logo.svg`
      }
    };

    return configuraciones[clinicaAlias] || configuraciones['default'];
  }
}
