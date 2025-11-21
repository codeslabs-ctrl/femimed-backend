import puppeteer from 'puppeteer';
import { supabase } from '../config/database';
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
    try {
      console.log(`🔄 Generando PDF para informe ${informeId}`);
      
      // Obtener el informe con datos básicos del médico
      const { data: informe, error } = await supabase
        .from('informes_medicos')
        .select(`
          *,
          medicos (
            nombres,
            apellidos
          )
        `)
        .eq('id', informeId)
        .single();

      if (error) {
        console.error('❌ Error en consulta Supabase:', error);
        throw new Error(`Error obteniendo informe: ${error.message}`);
      }

      if (!informe) {
        console.error('❌ No se encontró informe con ID:', informeId);
        throw new Error('Informe no encontrado');
      }

      console.log('✅ Informe encontrado:', {
        id: informe.id,
        numero_informe: informe.numero_informe,
        medico_id: informe.medico_id,
        titulo: informe.titulo
      });

      // Obtener firma digital del médico
      console.log(`🔍 Obteniendo firma digital para médico ID: ${informe.medico_id}`);
      const firmaBase64 = await this.firmaService.obtenerFirmaBase64(informe.medico_id);
      
      if (firmaBase64) {
        console.log(`✅ Firma digital obtenida exitosamente (${Math.round(firmaBase64.length / 1024)}KB)`);
      } else {
        console.warn(`⚠️ No se encontró firma digital para médico ID: ${informe.medico_id}`);
        console.warn(`⚠️ El PDF se generará sin firma digital`);
      }
      
      // Generar HTML para el PDF
      const htmlContent = await this.generarHTMLParaPDF(informe, firmaBase64);
      
      // Configurar Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--single-process'
        ],
        ignoreDefaultArgs: ['--disable-extensions']
      });
      
      const page = await browser.newPage();
      
      // Establecer el contenido HTML
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      // Generar PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });
      
      await browser.close();
      
      console.log('✅ Navegador cerrado correctamente');
      
      console.log(`✅ PDF generado exitosamente para informe ${informeId}`);
      return Buffer.from(pdfBuffer);
      
    } catch (error) {
      console.error('❌ Error generando PDF:', error);
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
                   padding: 2mm 15mm;
                   background: white;
                 }
                 
                 .header {
                   text-align: center;
                   margin-bottom: 5px;
                   border-bottom: none;
                   padding-bottom: 5px;
                 }
          
                 .logo {
                   width: 100px;
                   height: 100px;
                   margin: 0 auto 8px;
                   display: block;
                   object-fit: contain;
                 }
          
          .clinic-info {
            font-size: 9pt;
            color: #666;
            margin-bottom: 10px;
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
            margin: 15px 0;
            text-align: justify;
          }
          
          .content h2 {
            color: #E91E63;
            margin: 15px 0 8px 0;
            font-size: 12pt;
            font-weight: bold;
            border-bottom: 1px solid #E91E63;
            padding-bottom: 2px;
          }
          
          .content h3 {
            color: #333;
            margin: 12px 0 6px 0;
            font-size: 11pt;
            font-weight: bold;
          }
          
          .content p {
            margin-bottom: 8px;
            text-indent: 15px;
            line-height: 1.4;
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
            margin-top: 40px;
            text-align: center;
          }
          
          .signature-line {
            border-bottom: 1px solid #333;
            width: 150px;
            margin: 30px auto 5px;
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
            margin-top: 20px;
            font-size: 9pt;
            color: #666;
          }
          
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 8pt;
            color: #999;
            border-top: 1px solid #eee;
            padding-top: 8px;
          }
          
          @media print {
            .page {
              margin: 0;
              padding: 8mm 15mm;
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
                       `<div class="logo-fallback" style="width: 100px; height: 100px; background: ${clinicaConfig.color}; border-radius: 6px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">${clinicaConfig.nombre.charAt(0)}</div>`
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
              Especialista en Ginecología y Obstetricia
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
   * Procesa el contenido del informe para aplicar estilos de columnas
   */
  private procesarContenidoInforme(contenido: string, _informe: any): string {
    // Buscar secciones de datos del paciente y aplicar estilos de columnas
    let contenidoProcesado = contenido;
    
    // Reemplazar por una línea descriptiva del paciente (dinámica)
    contenidoProcesado = contenidoProcesado.replace(
      /<h2>Datos del Paciente<\/h2>[\s\S]*?(?=<h2>|<h3>|$)/gi,
      (_match) => {
        const datos = _match.replace(/<h2>Datos del Paciente<\/h2>/i, '');

        const extraerEtiqueta = (campo: string): string => {
          const patrones = [
            new RegExp(`<strong>\\s*${campo}\\s*:<\\/strong>\\s*([^<\\\n]+)`, 'i'),
            new RegExp(`${campo}\\s*:\\s*([^<\\\n]+)`, 'i'),
            new RegExp(`<b>\\s*${campo}\\s*:<\\/b>\\s*([^<\\\n]+)`, 'i')
          ];
          for (const rx of patrones) {
            const m = datos.match(rx);
            if (m && m[1]) return m[1].trim();
          }
          return '';
        };

        const nombre = extraerEtiqueta('Nombre');
        const edad = extraerEtiqueta('Edad');
        const sexoRaw = extraerEtiqueta('Sexo');
        const cedula = extraerEtiqueta('Cédula') || extraerEtiqueta('Cedula');

        let sexo = '';
        if (sexoRaw) {
          const s = sexoRaw.toLowerCase().trim();
          if (s.startsWith('f')) sexo = 'femenino';
          else if (s.startsWith('m')) sexo = 'masculino';
          else sexo = s;
        }

        // Construcción robusta sin comas colgantes
        const partes: string[] = [];
        if (nombre) partes.push(nombre);
        if (cedula) partes.push(`cédula de identidad ${cedula}`);

        const descrip: string[] = ['paciente'];
        if (sexo) descrip.push(sexo);
        if (edad) descrip.push(`de ${edad} de edad`);

        const frase = `${partes.join(', ')}${partes.length ? ', ' : ''}${descrip.join(' ')}.`.replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
        return `<p>${frase}</p>`;
      }
    );

    // Remover completamente la sección "Datos del Médico"
    contenidoProcesado = contenidoProcesado.replace(
      /<h2>Datos del Médico<\/h2>([\s\S]*?)(?=<h2>|<h3>|$)/gi,
      ''
    );
    
    // Envolver TODO el contenido del informe en un solo contenedor
    contenidoProcesado = `<div class="informe-content">${contenidoProcesado}</div>`;
    
    return contenidoProcesado;
  }

  // Eliminado: formatearDatosPaciente (ya no se usa)


  // Eliminado: extraerValor (ya no se usa)

  /**
   * Convierte el logo a base64
   */
  private async obtenerLogoBase64(logoPath: string): Promise<string> {
    try {
      // Si la ruta es relativa (empieza con ./), resolverla desde el directorio del proyecto
      // El código compilado está en dist/, así que subimos 2 niveles para llegar a la raíz
      let logoFile: string;
      if (logoPath.startsWith('./') || logoPath.startsWith('../')) {
        // Resolver desde el directorio del proyecto (raíz del backend)
        const projectRoot = path.join(__dirname, '..', '..');
        logoFile = path.resolve(projectRoot, logoPath);
      } else if (path.isAbsolute(logoPath)) {
        // Si es absoluta, usarla tal cual
        logoFile = logoPath;
      } else {
        // Si es relativa sin ./ o ../, también resolverla desde el proyecto
        const projectRoot = path.join(__dirname, '..', '..');
        logoFile = path.resolve(projectRoot, logoPath);
      }
      
      console.log('🔍 Buscando logo en:', logoFile);
      
      if (fs.existsSync(logoFile)) {
        const logoBuffer = fs.readFileSync(logoFile);
        const base64 = logoBuffer.toString('base64');
        const mimeType = logoPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
        return `data:${mimeType};base64,${base64}`;
      } else {
        console.error('❌ Logo no encontrado en:', logoFile);
      }
    } catch (error) {
      console.error('❌ Error leyendo logo:', error);
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
        nombre: 'FemiMed',
        descripcion: 'Centro Médico Especializado',
        especialidad: 'Ginecología y Obstetricia',
        color: '#E91E63',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/femimed/logo.svg',
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
