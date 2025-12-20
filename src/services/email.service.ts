import nodemailer from 'nodemailer';
import { config } from '../config/environment.js';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  encoding?: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configuración del transporter
    this.transporter = nodemailer.createTransport({
      service: config.email.service,
      auth: {
        user: config.email.user,
        pass: config.email.password
      }
    });
  }

  /**
   * Envía un email genérico
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      console.log('📧 EmailService - Configuración:');
      console.log('  - Service:', config.email.service);
      console.log('  - User:', config.email.user);
      console.log('  - From:', config.email.from);
      console.log('  - To:', options.to);
      console.log('  - Subject:', options.subject);
      
      const mailOptions = {
        from: config.email.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
        priority: options.priority
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email enviado exitosamente:', result.messageId);
      return true;
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return false;
    }
  }

  /**
   * Envía email usando una plantilla
   */
  async sendTemplateEmail(
    to: string | string[],
    template: EmailTemplate,
    variables: Record<string, any> = {},
    options: Partial<EmailOptions> = {}
  ): Promise<boolean> {
    try {
      console.log('📧 sendTemplateEmail - Iniciando...');
      console.log('📧 sendTemplateEmail - To:', to);
      console.log('📧 sendTemplateEmail - Variables:', variables);

      // Reemplazar variables en el template
      let processedSubject = template.subject;
      let processedHtml = template.html;
      let processedText = template.text;

      Object.keys(variables).forEach(key => {
        const placeholder = `{{${key}}}`;
        const value = variables[key] || '';
        
        processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), value);
        processedHtml = processedHtml.replace(new RegExp(placeholder, 'g'), value);
        if (processedText) {
          processedText = processedText.replace(new RegExp(placeholder, 'g'), value);
        }
      });

      console.log('📧 sendTemplateEmail - Subject procesado:', processedSubject);

      const result = await this.sendEmail({
        to,
        subject: processedSubject,
        html: processedHtml,
        text: processedText || '',
        ...options
      });

      console.log('📧 sendTemplateEmail - Resultado:', result);
      return result;
    } catch (error) {
      console.error('❌ Error procesando template de email:', error);
      return false;
    }
  }

  /**
   * Envía email de confirmación de consulta
   */
  async sendConsultaConfirmation(
    pacienteEmail: string,
    medicoEmail: string,
    consultaData: {
      pacienteNombre: string;
      medicoNombre: string;
      fecha: string;
      hora: string;
      motivo: string;
      tipo: string;
      duracion: number;
    }
  ): Promise<{ paciente: boolean; medico: boolean }> {
    const results = { paciente: false, medico: false };

    // Email al paciente
    const pacienteTemplate = this.getConsultaPacienteTemplate();
    results.paciente = await this.sendTemplateEmail(
      pacienteEmail,
      pacienteTemplate,
      consultaData
    );

    // Email al médico
    const medicoTemplate = this.getConsultaMedicoTemplate();
    results.medico = await this.sendTemplateEmail(
      medicoEmail,
      medicoTemplate,
      consultaData
    );

    return results;
  }

  /**
   * Envía email de reagendamiento de consulta
   */
  async sendConsultaReschedule(
    pacienteEmail: string,
    medicoEmail: string,
    consultaData: {
      pacienteNombre: string;
      medicoNombre: string;
      fechaAnterior: string;
      horaAnterior: string;
      fechaNueva: string;
      horaNueva: string;
      motivo: string;
      tipo: string;
    }
  ): Promise<{ paciente: boolean; medico: boolean }> {
    const results = { paciente: false, medico: false };

    // Email al paciente
    const pacienteTemplate = this.getReagendamientoPacienteTemplate();
    results.paciente = await this.sendTemplateEmail(
      pacienteEmail,
      pacienteTemplate,
      consultaData
    );

    // Email al médico
    const medicoTemplate = this.getReagendamientoMedicoTemplate();
    results.medico = await this.sendTemplateEmail(
      medicoEmail,
      medicoTemplate,
      consultaData
    );

    return results;
  }

  /**
   * Envía email de finalización de consulta
   */
  async sendConsultaCompletion(
    pacienteEmail: string,
    medicoEmail: string,
    consultaData: {
      pacienteNombre: string;
      medicoNombre: string;
      fecha: string;
      hora: string;
      motivo: string;
      diagnostico: string;
      observaciones?: string;
      tipo: string;
    }
  ): Promise<{ paciente: boolean; medico: boolean }> {
    const results = { paciente: false, medico: false };

    // Email al paciente
    const pacienteTemplate = this.getFinalizacionPacienteTemplate();
    results.paciente = await this.sendTemplateEmail(
      pacienteEmail,
      pacienteTemplate,
      consultaData
    );

    // Email al médico
    const medicoTemplate = this.getFinalizacionMedicoTemplate();
    results.medico = await this.sendTemplateEmail(
      medicoEmail,
      medicoTemplate,
      consultaData
    );

    return results;
  }

  /**
   * Envía email de cancelación de consulta
   */
  async sendConsultaCancellation(
    pacienteEmail: string,
    medicoEmail: string,
    consultaData: {
      pacienteNombre: string;
      medicoNombre: string;
      fecha: string;
      hora: string;
      motivo: string;
      motivoCancelacion: string;
      tipo: string;
    }
  ): Promise<{ paciente: boolean; medico: boolean }> {
    console.log('📧 EmailService.sendConsultaCancellation - Iniciando...');
    console.log('📧 EmailService - Paciente email:', pacienteEmail);
    console.log('📧 EmailService - Médico email:', medicoEmail);
    console.log('📧 EmailService - Datos:', consultaData);

    const results = { paciente: false, medico: false };

    // Email al paciente
    console.log('📧 Enviando email al paciente...');
    const pacienteTemplate = this.getCancelacionPacienteTemplate();
    results.paciente = await this.sendTemplateEmail(
      pacienteEmail,
      pacienteTemplate,
      consultaData
    );
    console.log('📧 Resultado email paciente:', results.paciente);

    // Email al médico
    console.log('📧 Enviando email al médico...');
    const medicoTemplate = this.getCancelacionMedicoTemplate();
    results.medico = await this.sendTemplateEmail(
      medicoEmail,
      medicoTemplate,
      consultaData
    );
    console.log('📧 Resultado email médico:', results.medico);

    console.log('📧 EmailService.sendConsultaCancellation - Finalizado:', results);
    return results;
  }

  /**
   * Envía email de recordatorio de consulta
   */
  async sendConsultaReminder(
    pacienteEmail: string,
    consultaData: {
      pacienteNombre: string;
      medicoNombre: string;
      fecha: string;
      hora: string;
      motivo: string;
    }
  ): Promise<boolean> {
    const template = this.getConsultaReminderTemplate();
    return await this.sendTemplateEmail(
      pacienteEmail,
      template,
      consultaData
    );
  }

  /**
   * Envía OTP para recuperación de contraseña
   */
  async sendPasswordRecoveryOTP(
    userEmail: string,
    otpData: {
      nombre: string;
      otp: string;
      expiresIn: string;
    }
  ): Promise<boolean> {
    const template = this.getPasswordRecoveryTemplate();
    return await this.sendTemplateEmail(
      userEmail,
      template,
      otpData
    );
  }

  /**
   * Envía OTP para verificación de usuario nuevo
   */
  async sendUserVerificationOTP(
    userEmail: string,
    otpData: {
      nombre: string;
      otp: string;
      expiresIn: string;
    }
  ): Promise<boolean> {
    const template = this.getUserVerificationTemplate();
    return await this.sendTemplateEmail(
      userEmail,
      template,
      otpData
    );
  }

  /**
   * Envía email de bienvenida para nuevo usuario
   */
  async sendWelcomeEmail(
    userEmail: string,
    userData: {
      nombre: string;
      email: string;
      rol: string;
      password?: string;
    }
  ): Promise<boolean> {
    const template = this.getWelcomeTemplate();
    return await this.sendTemplateEmail(
      userEmail,
      template,
      userData
    );
  }

  /**
   * Envía email de bienvenida para nuevo médico con OTP
   */
  async sendMedicoWelcomeEmail(
    userEmail: string,
    medicoData: {
      nombre: string;
      username: string;
      userEmail: string;
      otp: string;
      expiresIn: string;
    }
  ): Promise<boolean> {
    const template = this.getMedicoWelcomeTemplate();
    return await this.sendTemplateEmail(
      userEmail,
      template,
      medicoData
    );
  }

  // ===== PLANTILLAS DE EMAIL =====

  private getConsultaPacienteTemplate(): EmailTemplate {
    return {
      subject: 'Confirmación de Consulta',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Confirmación de Consulta</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-box { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #E91E63; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Confirmación de Consulta</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            <div class="content">
              <p>Estimado/a <strong>{{pacienteNombre}}</strong>,</p>
              
              <p>Su consulta ha sido agendada exitosamente. A continuación los detalles:</p>
              
              <div class="info-box">
                <h3>📅 Información de la Consulta</h3>
                <p><strong>Fecha:</strong> {{fecha}}</p>
                <p><strong>Hora:</strong> {{hora}}</p>
                <p><strong>Médico:</strong> Dr./Dra. {{medicoNombre}}</p>
                <p><strong>Motivo:</strong> {{motivo}}</p>
                <p><strong>Tipo:</strong> {{tipo}}</p>
                <p><strong>Duración estimada:</strong> {{duracion}} minutos</p>
              </div>
              
              <p><strong>Importante:</strong></p>
              <ul>
                <li>Llegue 15 minutos antes de su cita</li>
                <li>Traiga su documento de identidad</li>
                <li>Si necesita reagendar, contáctenos con 24 horas de anticipación</li>
              </ul>
              
              <p>Si tiene alguna pregunta, no dude en contactarnos.</p>
              
              <p>Saludos cordiales,<br>Equipo del Sistema</p>
            </div>
            <div class="footer">
              <p>Este es un mensaje automático, por favor no responda a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Confirmación de Consulta
        
        Estimado/a {{pacienteNombre}},
        
        Su consulta ha sido agendada exitosamente:
        
        Fecha: {{fecha}}
        Hora: {{hora}}
        Médico: Dr./Dra. {{medicoNombre}}
        Motivo: {{motivo}}
        Tipo: {{tipo}}
        Duración: {{duracion}} minutos
        
        Importante:
        - Llegue 15 minutos antes
        - Traiga su documento de identidad
        - Para reagendar, contáctenos con 24h de anticipación
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  private getMedicoWelcomeTemplate(): EmailTemplate {
    return {
      subject: 'Bienvenido - Acceso al Sistema',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Bienvenido</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #E91E63; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .otp-box { background: #fff; padding: 20px; margin: 20px 0; text-align: center; border: 2px solid #E91E63; border-radius: 8px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #E91E63; letter-spacing: 5px; }
            .info-box { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #E91E63; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>👨‍⚕️ ${config.sistema.clinicaNombre}</h1>
              <h2>¡Bienvenido!</h2>
            </div>
            <div class="content">
              <p>Estimado/a Dr./Dra. <strong>{{nombre}}</strong>,</p>
              
              <p>¡Bienvenido! Su cuenta de médico ha sido creada exitosamente y ya puede acceder al sistema.</p>
              
              <div class="info-box">
                <h3>🔑 Información de Acceso</h3>
                <p><strong>Usuario:</strong> {{username}}</p>
                <p><strong>Email:</strong> {{userEmail}}</p>
                <p><strong>Rol:</strong> Médico</p>
              </div>
              
              <div class="otp-box">
                <h3>Su código de acceso temporal es:</h3>
                <div class="otp-code">{{otp}}</div>
                <p><small>Este código expira en {{expiresIn}}</small></p>
              </div>
              
              <div class="warning">
                <h4>⚠️ Importante - Primer Acceso</h4>
                <ul>
                  <li><strong>Use el código OTP</strong> para su primer acceso al sistema</li>
                  <li><strong>Será obligatorio</strong> cambiar la contraseña en el primer login</li>
                  <li>Establezca una contraseña segura que solo usted conozca</li>
                  <li>Este código OTP es de un solo uso y expirará automáticamente</li>
                </ul>
              </div>
              
              <p><strong>Pasos para acceder:</strong></p>
              <ol>
                <li>Vaya a la página de login del sistema</li>
                <li>Ingrese su email: <strong>{{userEmail}}</strong></li>
                <li>Use el código OTP: <strong>{{otp}}</strong></li>
                <li>El sistema le pedirá crear una nueva contraseña</li>
                <li>¡Listo! Ya puede gestionar sus pacientes</li>
              </ol>
              
              <p>Una vez configurada su contraseña, podrá acceder normalmente con su email y la contraseña que establezca.</p>
              
              <p>Saludos cordiales,<br>Equipo del Sistema</p>
            </div>
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Por seguridad, este código expirará automáticamente.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Bienvenido - Acceso al Sistema
        
        Estimado/a Dr./Dra. {{nombre}},
        
        ¡Bienvenido! Su cuenta de médico ha sido creada exitosamente.
        
        INFORMACIÓN DE ACCESO:
        Usuario: {{username}}
        Email: {{userEmail}}
        Rol: Médico
        
        CÓDIGO DE ACCESO TEMPORAL: {{otp}}
        (Este código expira en {{expiresIn}})
        
        IMPORTANTE - PRIMER ACCESO:
        - Use el código OTP para su primer acceso
        - Será obligatorio cambiar la contraseña en el primer login
        - Establezca una contraseña segura
        - Este código es de un solo uso
        
        PASOS PARA ACCEDER:
        1. Vaya a la página de login del sistema
        2. Ingrese su email: {{userEmail}}
        3. Use el código OTP: {{otp}}
        4. El sistema le pedirá crear una nueva contraseña
        5. ¡Listo! Ya puede gestionar sus pacientes
        
        Una vez configurada su contraseña, podrá acceder normalmente.
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  private getConsultaMedicoTemplate(): EmailTemplate {
    return {
      subject: 'Nueva Consulta Agendada',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Nueva Consulta Agendada</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-box { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #2c3e50; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>👨‍⚕️ Nueva Consulta Agendada</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            <div class="content">
              <p>Dr./Dra. <strong>{{medicoNombre}}</strong>,</p>
              
              <p>Se ha agendado una nueva consulta en su agenda:</p>
              
              <div class="info-box">
                <h3>📋 Detalles de la Consulta</h3>
                <p><strong>Paciente:</strong> {{pacienteNombre}}</p>
                <p><strong>Fecha:</strong> {{fecha}}</p>
                <p><strong>Hora:</strong> {{hora}}</p>
                <p><strong>Motivo:</strong> {{motivo}}</p>
                <p><strong>Tipo:</strong> {{tipo}}</p>
                <p><strong>Duración:</strong> {{duracion}} minutos</p>
              </div>
              
              <p>Puede revisar todos sus pacientes en el sistema.</p>
              
              <p>Saludos,<br>Equipo del Sistema</p>
            </div>
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  private getConsultaReminderTemplate(): EmailTemplate {
    return {
      subject: 'Recordatorio de Consulta',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Recordatorio de Consulta</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f39c12; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-box { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #f39c12; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Recordatorio de Consulta</h1>
              <h2>Recordatorio de Consulta</h2>
            </div>
            <div class="content">
              <p>Estimado/a <strong>{{pacienteNombre}}</strong>,</p>
              
              <p>Le recordamos que tiene una consulta programada:</p>
              
              <div class="info-box">
                <h3>📅 Su Próxima Consulta</h3>
                <p><strong>Fecha:</strong> {{fecha}}</p>
                <p><strong>Hora:</strong> {{hora}}</p>
                <p><strong>Médico:</strong> Dr./Dra. {{medicoNombre}}</p>
                <p><strong>Motivo:</strong> {{motivo}}</p>
              </div>
              
              <p><strong>No olvide:</strong></p>
              <ul>
                <li>Llegar 15 minutos antes</li>
                <li>Traer su documento de identidad</li>
                <li>Traer estudios médicos previos si los tiene</li>
              </ul>
              
              <p>Si necesita reagendar, contáctenos lo antes posible.</p>
              
              <p>Saludos,<br>Equipo del Sistema</p>
            </div>
            <div class="footer">
              <p>Este es un recordatorio automático.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  private getPasswordRecoveryTemplate(): EmailTemplate {
    return {
      subject: 'Recuperación de Contraseña',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Recuperación de Contraseña</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .otp-box { background: #fff; padding: 20px; margin: 20px 0; text-align: center; border: 2px solid #e74c3c; border-radius: 8px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #e74c3c; letter-spacing: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Recuperación de Contraseña</h1>
              <h2>Recuperación de Contraseña</h2>
            </div>
            <div class="content">
              <p>Estimado/a <strong>{{nombre}}</strong>,</p>
              
              <p>Hemos recibido una solicitud para recuperar su contraseña. Use el siguiente código para continuar:</p>
              
              <div class="otp-box">
                <h3>Su código de verificación es:</h3>
                <div class="otp-code">{{otp}}</div>
                <p><small>Este código expira en {{expiresIn}}</small></p>
              </div>
              
              <p><strong>Importante:</strong></p>
              <ul>
                <li>Este código es válido por tiempo limitado</li>
                <li>No comparta este código con nadie</li>
                <li>Si no solicitó este cambio, ignore este email</li>
              </ul>
              
              <p>Saludos,<br>Equipo del Sistema</p>
            </div>
            <div class="footer">
              <p>Por seguridad, este código expirará automáticamente.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  private getUserVerificationTemplate(): EmailTemplate {
    return {
      subject: 'Verificación de Usuario',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verificación de Usuario</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .otp-box { background: #fff; padding: 20px; margin: 20px 0; text-align: center; border: 2px solid #27ae60; border-radius: 8px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #27ae60; letter-spacing: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Verificación de Usuario</h1>
              <h2>Verificación de Usuario</h2>
            </div>
            <div class="content">
              <p>Estimado/a <strong>{{nombre}}</strong>,</p>
              
              <p>Bienvenido. Para completar su registro, use el siguiente código de verificación:</p>
              
              <div class="otp-box">
                <h3>Su código de verificación es:</h3>
                <div class="otp-code">{{otp}}</div>
                <p><small>Este código expira en {{expiresIn}}</small></p>
              </div>
              
              <p>Una vez verificado, podrá acceder a todas las funcionalidades del sistema.</p>
              
              <p>Saludos,<br>Equipo del Sistema</p>
            </div>
            <div class="footer">
              <p>Gracias por unirse al sistema.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  private getWelcomeTemplate(): EmailTemplate {
    return {
      subject: 'Bienvenido',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Bienvenido</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #E91E63; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-box { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #E91E63; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 ¡Bienvenido!</h1>
              <h2>¡Bienvenido!</h2>
            </div>
            <div class="content">
              <p>Estimado/a <strong>{{nombre}}</strong>,</p>
              
              <p>¡Bienvenido! Su cuenta ha sido creada exitosamente.</p>
              
              <div class="info-box">
                <h3>📋 Información de su Cuenta</h3>
                <p><strong>Email:</strong> {{email}}</p>
                <p><strong>Rol:</strong> {{rol}}</p>
                {{#if password}}
                <p><strong>Contraseña temporal:</strong> {{password}}</p>
                <p><small>Por seguridad, le recomendamos cambiar esta contraseña en su primer acceso.</small></p>
                {{/if}}
              </div>
              
              <p>Puede acceder al sistema en cualquier momento para gestionar sus pacientes y consultas.</p>
              
              <p>Saludos,<br>Equipo del Sistema</p>
            </div>
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  /**
   * Envía email de notificación de remisión al médico remitido
   */
  async sendRemisionNotification(
    medicoRemitidoEmail: string,
    remisionData: {
      pacienteNombre: string;
      pacienteApellidos: string;
      pacienteEdad: number;
      pacienteSexo: string;
      medicoRemitenteNombre: string;
      medicoRemitenteApellidos: string;
      medicoRemitenteEspecialidad: string;
      motivoRemision: string;
      observaciones?: string;
      fechaRemision: string;
    }
  ): Promise<boolean> {
    try {
      const template = this.getRemisionNotificationTemplate();
      
      const variables = {
        pacienteNombre: remisionData.pacienteNombre,
        pacienteApellidos: remisionData.pacienteApellidos,
        pacienteEdad: remisionData.pacienteEdad,
        pacienteSexo: remisionData.pacienteSexo,
        medicoRemitenteNombre: remisionData.medicoRemitenteNombre,
        medicoRemitenteApellidos: remisionData.medicoRemitenteApellidos,
        medicoRemitenteEspecialidad: remisionData.medicoRemitenteEspecialidad,
        motivoRemision: remisionData.motivoRemision,
        observaciones: remisionData.observaciones || 'No hay observaciones adicionales',
        fechaRemision: remisionData.fechaRemision
      };

      return await this.sendTemplateEmail(
        medicoRemitidoEmail,
        template,
        variables,
        {
          priority: 'high'
        }
      );
    } catch (error) {
      console.error('❌ Error enviando email de remisión:', error);
      return false;
    }
  }

  /**
   * Template para email de notificación de remisión
   */
  private getRemisionNotificationTemplate(): EmailTemplate {
    return {
      subject: 'Nueva Interconsulta de Paciente',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Nueva Remisión de Paciente</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 2rem; text-align: center; }
            .header h1 { margin: 0; font-size: 1.8rem; }
            .content { padding: 2rem; }
            .patient-info { background: #f8f9fa; border-left: 4px solid #E91E63; padding: 1.5rem; margin: 1rem 0; border-radius: 0 8px 8px 0; }
            .medico-info { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 1.5rem; margin: 1rem 0; border-radius: 0 8px 8px 0; }
            .remision-details { background: #fff3e0; border-left: 4px solid #FF9800; padding: 1.5rem; margin: 1rem 0; border-radius: 0 8px 8px 0; }
            .footer { background: #f5f5f5; padding: 1rem; text-align: center; color: #666; font-size: 0.9rem; }
            .btn { display: inline-block; background: #E91E63; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 1rem 0; }
            .btn:hover { background: #C2185B; }
            .highlight { background: #fff3cd; padding: 1rem; border-radius: 6px; border-left: 4px solid #ffc107; margin: 1rem 0; }
            .info-row { display: flex; justify-content: space-between; margin: 0.5rem 0; }
            .info-label { font-weight: bold; color: #555; }
            .info-value { color: #333; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏥 Nueva Remisión de Paciente</h1>
              <p>Ha recibido una nueva remisión de paciente</p>
            </div>
            
            <div class="content">
              <div class="highlight">
                <h3>📋 Información del Paciente</h3>
                <div class="patient-info">
                  <div class="info-row">
                    <span class="info-label">Nombre completo:</span>
                    <span class="info-value">{{pacienteNombre}} {{pacienteApellidos}}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Edad:</span>
                    <span class="info-value">{{pacienteEdad}} años</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Sexo:</span>
                    <span class="info-value">{{pacienteSexo}}</span>
                  </div>
                </div>
              </div>

              <div class="medico-info">
                <h3>👨‍⚕️ Médico Remitente</h3>
                <div class="info-row">
                  <span class="info-label">Nombre:</span>
                  <span class="info-value">Dr. {{medicoRemitenteNombre}} {{medicoRemitenteApellidos}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Especialidad:</span>
                  <span class="info-value">{{medicoRemitenteEspecialidad}}</span>
                </div>
              </div>

              <div class="remision-details">
                <h3>📝 Detalles de la Remisión</h3>
                <div class="info-row">
                  <span class="info-label">Motivo:</span>
                  <span class="info-value">{{motivoRemision}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Observaciones:</span>
                  <span class="info-value">{{observaciones}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Fecha de remisión:</span>
                  <span class="info-value">{{fechaRemision}}</span>
                </div>
              </div>

              <p><strong>Próximos pasos:</strong></p>
              <ul>
                <li>Revise la información del paciente en el sistema</li>
                <li>Programe una consulta si es necesario</li>
                <li>Actualice el estado de la remisión (Aceptada/Rechazada)</li>
                <li>Mantenga comunicación con el médico remitente</li>
              </ul>

              <p>Por favor, acceda al sistema para gestionar esta remisión y proporcionar la atención médica correspondiente.</p>
            </div>
            
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  private getCancelacionPacienteTemplate(): EmailTemplate {
    return {
      subject: 'Consulta Cancelada',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Consulta Cancelada</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-row { display: flex; margin: 10px 0; }
            .info-label { font-weight: bold; width: 150px; }
            .info-value { flex: 1; }
            .footer { text-align: center; margin-top: 20px; color: #666; }
            .btn { display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
            .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚫 Consulta Cancelada</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            
            <div class="content">
              <div class="alert">
                <strong>⚠️ Su consulta médica ha sido cancelada</strong>
              </div>
              
              <p>Estimado/a <strong>{{pacienteNombre}}</strong>,</p>
              
              <p>Le informamos que su consulta médica ha sido cancelada. A continuación, los detalles:</p>
              
              <div class="consulta-details">
                <h3>📅 Información de la Consulta Cancelada</h3>
                <div class="info-row">
                  <span class="info-label">Médico:</span>
                  <span class="info-value">{{medicoNombre}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Fecha:</span>
                  <span class="info-value">{{fecha}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Hora:</span>
                  <span class="info-value">{{hora}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Tipo:</span>
                  <span class="info-value">{{tipo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo original:</span>
                  <span class="info-value">{{motivo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo de cancelación:</span>
                  <span class="info-value">{{motivoCancelacion}}</span>
                </div>
              </div>
              
              <div style="margin: 20px 0;">
                <p><strong>¿Qué hacer ahora?</strong></p>
                <ul>
                  <li>Si necesita reagendar su consulta, puede contactar directamente con el médico</li>
                  <li>Si tiene alguna pregunta, no dude en contactarnos</li>
                  <li>Para nuevas consultas, puede acceder al sistema</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        CONSULTA CANCELADA
        
        Estimado/a {{pacienteNombre}},
        
        Le informamos que su consulta médica ha sido cancelada.
        
        Detalles de la consulta cancelada:
        - Médico: {{medicoNombre}}
        - Fecha: {{fecha}}
        - Hora: {{hora}}
        - Tipo: {{tipo}}
        - Motivo original: {{motivo}}
        - Motivo de cancelación: {{motivoCancelacion}}
        
        Si necesita reagendar su consulta, puede contactar directamente con el médico.
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  private getCancelacionMedicoTemplate(): EmailTemplate {
    return {
      subject: 'Consulta Cancelada',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Consulta Cancelada</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-row { display: flex; margin: 10px 0; }
            .info-label { font-weight: bold; width: 150px; }
            .info-value { flex: 1; }
            .footer { text-align: center; margin-top: 20px; color: #666; }
            .btn { display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
            .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚫 Consulta Cancelada</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            
            <div class="content">
              <div class="alert">
                <strong>⚠️ Una consulta ha sido cancelada</strong>
              </div>
              
              <p>Estimado/a Dr./Dra. <strong>{{medicoNombre}}</strong>,</p>
              
              <p>Le informamos que una consulta en su agenda ha sido cancelada. A continuación, los detalles:</p>
              
              <div class="consulta-details">
                <h3>📅 Información de la Consulta Cancelada</h3>
                <div class="info-row">
                  <span class="info-label">Paciente:</span>
                  <span class="info-value">{{pacienteNombre}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Fecha:</span>
                  <span class="info-value">{{fecha}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Hora:</span>
                  <span class="info-value">{{hora}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Tipo:</span>
                  <span class="info-value">{{tipo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo original:</span>
                  <span class="info-value">{{motivo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo de cancelación:</span>
                  <span class="info-value">{{motivoCancelacion}}</span>
                </div>
              </div>
              
              <div style="margin: 20px 0;">
                <p><strong>Acciones recomendadas:</strong></p>
                <ul>
                  <li>Verificar si el paciente necesita reagendar la consulta</li>
                  <li>Actualizar su agenda médica</li>
                  <li>Contactar al paciente si es necesario</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        CONSULTA CANCELADA
        
        Estimado/a Dr./Dra. {{medicoNombre}},
        
        Le informamos que una consulta en su agenda ha sido cancelada.
        
        Detalles de la consulta cancelada:
        - Paciente: {{pacienteNombre}}
        - Fecha: {{fecha}}
        - Hora: {{hora}}
        - Tipo: {{tipo}}
        - Motivo original: {{motivo}}
        - Motivo de cancelación: {{motivoCancelacion}}
        
        Acciones recomendadas:
        - Verificar si el paciente necesita reagendar la consulta
        - Actualizar su agenda médica
        - Contactar al paciente si es necesario
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  private getReagendamientoPacienteTemplate(): EmailTemplate {
    return {
      subject: `Consulta Reagendada - ${config.sistema.clinicaNombre}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Consulta Reagendada</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f39c12; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-row { display: flex; margin: 10px 0; }
            .info-label { font-weight: bold; width: 150px; }
            .info-value { flex: 1; }
            .footer { text-align: center; margin-top: 20px; color: #666; }
            .btn { display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
            .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .change-box { background: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 Consulta Reagendada</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            
            <div class="content">
              <div class="alert">
                <strong>⚠️ Su consulta médica ha sido reagendada</strong>
              </div>
              
              <p>Estimado/a <strong>{{pacienteNombre}}</strong>,</p>
              
              <p>Le informamos que su consulta médica ha sido reagendada. A continuación, los detalles del cambio:</p>
              
              <div class="change-box">
                <h3>🔄 Cambio de Fecha y Hora</h3>
                <div class="info-row">
                  <span class="info-label">Fecha anterior:</span>
                  <span class="info-value">{{fechaAnterior}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Hora anterior:</span>
                  <span class="info-value">{{horaAnterior}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Nueva fecha:</span>
                  <span class="info-value"><strong>{{fechaNueva}}</strong></span>
                </div>
                <div class="info-row">
                  <span class="info-label">Nueva hora:</span>
                  <span class="info-value"><strong>{{horaNueva}}</strong></span>
                </div>
              </div>
              
              <div class="consulta-details">
                <h3>📋 Información de la Consulta</h3>
                <div class="info-row">
                  <span class="info-label">Médico:</span>
                  <span class="info-value">{{medicoNombre}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo:</span>
                  <span class="info-value">{{motivo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Tipo:</span>
                  <span class="info-value">{{tipo}}</span>
                </div>
              </div>
              
              <div style="margin: 20px 0;">
                <p><strong>Importante:</strong></p>
                <ul>
                  <li>Llegue 15 minutos antes de su nueva cita</li>
                  <li>Traiga su documento de identidad</li>
                  <li>Si no puede asistir a la nueva fecha, contáctenos inmediatamente</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        CONSULTA REAGENDADA - ${config.sistema.clinicaNombre}
        
        Estimado/a {{pacienteNombre}},
        
        Le informamos que su consulta médica ha sido reagendada.
        
        Cambio de fecha y hora:
        - Fecha anterior: {{fechaAnterior}}
        - Hora anterior: {{horaAnterior}}
        - Nueva fecha: {{fechaNueva}}
        - Nueva hora: {{horaNueva}}
        
        Información de la consulta:
        - Médico: {{medicoNombre}}
        - Motivo: {{motivo}}
        - Tipo: {{tipo}}
        
        Importante:
        - Llegue 15 minutos antes de su nueva cita
        - Traiga su documento de identidad
        - Si no puede asistir a la nueva fecha, contáctenos inmediatamente
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  private getReagendamientoMedicoTemplate(): EmailTemplate {
    return {
      subject: `Consulta Reagendada - ${config.sistema.clinicaNombre}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Consulta Reagendada</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f39c12; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-row { display: flex; margin: 10px 0; }
            .info-label { font-weight: bold; width: 150px; }
            .info-value { flex: 1; }
            .footer { text-align: center; margin-top: 20px; color: #666; }
            .btn { display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
            .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .change-box { background: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 Consulta Reagendada</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            
            <div class="content">
              <div class="alert">
                <strong>⚠️ Una consulta ha sido reagendada</strong>
              </div>
              
              <p>Estimado/a Dr./Dra. <strong>{{medicoNombre}}</strong>,</p>
              
              <p>Le informamos que una consulta en su agenda ha sido reagendada. A continuación, los detalles del cambio:</p>
              
              <div class="change-box">
                <h3>🔄 Cambio de Fecha y Hora</h3>
                <div class="info-row">
                  <span class="info-label">Fecha anterior:</span>
                  <span class="info-value">{{fechaAnterior}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Hora anterior:</span>
                  <span class="info-value">{{horaAnterior}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Nueva fecha:</span>
                  <span class="info-value"><strong>{{fechaNueva}}</strong></span>
                </div>
                <div class="info-row">
                  <span class="info-label">Nueva hora:</span>
                  <span class="info-value"><strong>{{horaNueva}}</strong></span>
                </div>
              </div>
              
              <div class="consulta-details">
                <h3>📋 Información de la Consulta</h3>
                <div class="info-row">
                  <span class="info-label">Paciente:</span>
                  <span class="info-value">{{pacienteNombre}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo:</span>
                  <span class="info-value">{{motivo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Tipo:</span>
                  <span class="info-value">{{tipo}}</span>
                </div>
              </div>
              
              <div style="margin: 20px 0;">
                <p><strong>Acciones recomendadas:</strong></p>
                <ul>
                  <li>Actualizar su agenda médica con la nueva fecha/hora</li>
                  <li>Verificar disponibilidad para la nueva fecha</li>
                  <li>Contactar al paciente si es necesario</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        CONSULTA REAGENDADA - ${config.sistema.clinicaNombre}
        
        Estimado/a Dr./Dra. {{medicoNombre}},
        
        Le informamos que una consulta en su agenda ha sido reagendada.
        
        Cambio de fecha y hora:
        - Fecha anterior: {{fechaAnterior}}
        - Hora anterior: {{horaAnterior}}
        - Nueva fecha: {{fechaNueva}}
        - Nueva hora: {{horaNueva}}
        
        Información de la consulta:
        - Paciente: {{pacienteNombre}}
        - Motivo: {{motivo}}
        - Tipo: {{tipo}}
        
        Acciones recomendadas:
        - Actualizar su agenda médica con la nueva fecha/hora
        - Verificar disponibilidad para la nueva fecha
        - Contactar al paciente si es necesario
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  private getFinalizacionPacienteTemplate(): EmailTemplate {
    return {
      subject: `Consulta Finalizada - ${config.sistema.clinicaNombre}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Consulta Finalizada</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-row { display: flex; margin: 10px 0; }
            .info-label { font-weight: bold; width: 150px; }
            .info-value { flex: 1; }
            .footer { text-align: center; margin-top: 20px; color: #666; }
            .btn { display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
            .alert { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .diagnosis-box { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Consulta Finalizada</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            
            <div class="content">
              <div class="alert">
                <strong>🎉 Su consulta médica ha sido finalizada</strong>
              </div>
              
              <p>Estimado/a <strong>{{pacienteNombre}}</strong>,</p>
              
              <p>Le informamos que su consulta médica ha sido finalizada exitosamente. A continuación, los detalles:</p>
              
              <div class="consulta-details">
                <h3>📅 Información de la Consulta</h3>
                <div class="info-row">
                  <span class="info-label">Médico:</span>
                  <span class="info-value">{{medicoNombre}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Fecha:</span>
                  <span class="info-value">{{fecha}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Hora:</span>
                  <span class="info-value">{{hora}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo:</span>
                  <span class="info-value">{{motivo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Tipo:</span>
                  <span class="info-value">{{tipo}}</span>
                </div>
              </div>
              
              <div class="diagnosis-box">
                <h3>🩺 Diagnóstico Preliminar</h3>
                <p><strong>{{diagnostico}}</strong></p>
                {{#if observaciones}}
                <h4>Observaciones:</h4>
                <p>{{observaciones}}</p>
                {{/if}}
              </div>
              
              <div style="margin: 20px 0;">
                <p><strong>Próximos pasos:</strong></p>
                <ul>
                  <li>Conserve este diagnóstico para futuras consultas</li>
                  <li>Si tiene dudas sobre el diagnóstico, contacte al médico</li>
                  <li>Para seguimientos o nuevas consultas, acceda al sistema ${config.sistema.clinicaNombre}</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        CONSULTA FINALIZADA - ${config.sistema.clinicaNombre}
        
        Estimado/a {{pacienteNombre}},
        
        Le informamos que su consulta médica ha sido finalizada exitosamente.
        
        Información de la consulta:
        - Médico: {{medicoNombre}}
        - Fecha: {{fecha}}
        - Hora: {{hora}}
        - Motivo: {{motivo}}
        - Tipo: {{tipo}}
        
        Diagnóstico preliminar:
        {{diagnostico}}
        
        {{#if observaciones}}
        Observaciones:
        {{observaciones}}
        {{/if}}
        
        Próximos pasos:
        - Conserve este diagnóstico para futuras consultas
        - Si tiene dudas sobre el diagnóstico, contacte al médico
        - Para seguimientos o nuevas consultas, acceda al sistema ${config.sistema.clinicaNombre}
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  private getFinalizacionMedicoTemplate(): EmailTemplate {
    return {
      subject: `Consulta Finalizada - ${config.sistema.clinicaNombre}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Consulta Finalizada</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-row { display: flex; margin: 10px 0; }
            .info-label { font-weight: bold; width: 150px; }
            .info-value { flex: 1; }
            .footer { text-align: center; margin-top: 20px; color: #666; }
            .btn { display: inline-block; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
            .alert { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .diagnosis-box { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Consulta Finalizada</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            
            <div class="content">
              <div class="alert">
                <strong>🎉 Ha finalizado una consulta exitosamente</strong>
              </div>
              
              <p>Estimado/a Dr./Dra. <strong>{{medicoNombre}}</strong>,</p>
              
              <p>Le informamos que ha finalizado una consulta en su agenda. A continuación, los detalles:</p>
              
              <div class="consulta-details">
                <h3>📅 Información de la Consulta</h3>
                <div class="info-row">
                  <span class="info-label">Paciente:</span>
                  <span class="info-value">{{pacienteNombre}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Fecha:</span>
                  <span class="info-value">{{fecha}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Hora:</span>
                  <span class="info-value">{{hora}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Motivo:</span>
                  <span class="info-value">{{motivo}}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Tipo:</span>
                  <span class="info-value">{{tipo}}</span>
                </div>
              </div>
              
              <div class="diagnosis-box">
                <h3>🩺 Diagnóstico Registrado</h3>
                <p><strong>{{diagnostico}}</strong></p>
                {{#if observaciones}}
                <h4>Observaciones:</h4>
                <p>{{observaciones}}</p>
                {{/if}}
              </div>
              
              <div style="margin: 20px 0;">
                <p><strong>Acciones recomendadas:</strong></p>
                <ul>
                  <li>El paciente ha sido notificado del diagnóstico</li>
                  <li>Considere programar seguimientos si es necesario</li>
                  <li>Revise su agenda para próximas consultas</li>
                </ul>
              </div>
            </div>
            
            <div class="footer">
              <p>${config.sistema.clinicaNombre}</p>
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        CONSULTA FINALIZADA - ${config.sistema.clinicaNombre}
        
        Estimado/a Dr./Dra. {{medicoNombre}},
        
        Le informamos que ha finalizado una consulta en su agenda.
        
        Información de la consulta:
        - Paciente: {{pacienteNombre}}
        - Fecha: {{fecha}}
        - Hora: {{hora}}
        - Motivo: {{motivo}}
        - Tipo: {{tipo}}
        
        Diagnóstico registrado:
        {{diagnostico}}
        
        {{#if observaciones}}
        Observaciones:
        {{observaciones}}
        {{/if}}
        
        Acciones recomendadas:
        - El paciente ha sido notificado del diagnóstico
        - Considere programar seguimientos si es necesario
        - Revise su agenda para próximas consultas
        
        Saludos,
        Equipo del Sistema
      `
    };
  }

  /**
   * Plantilla para envío de Informe Médico al paciente (HTML similar a consultas)
   */
  getInformePacienteTemplate(): EmailTemplate {
    return {
      subject: `Informe Médico N° {{numero_informe}} - ${config.sistema.clinicaNombre}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Informe Médico</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin:0; padding:0; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 24px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .info-box { background: white; padding: 16px; border-left: 4px solid #E91E63; margin: 12px 0; }
            .footer { text-align: center; padding: 16px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📄 Informe Médico</h1>
              <p>${config.sistema.clinicaNombre}</p>
            </div>
            <div class="content">
              <p>Estimado/a <strong>{{pacienteNombre}}</strong>,</p>
              <p>Adjunto encontrará su Informe Médico N° <strong>{{numero_informe}}</strong>, emitido el <strong>{{fecha_emision}}</strong>.</p>
              <div class="info-box">
                <p>Si tiene dudas o requiere aclaratorias, puede responder a este correo.</p>
              </div>
              <p>Saludos cordiales,<br>{{clinicaNombre}}</p>
            </div>
            <div class="footer">
              <p>Este es un mensaje automático, por favor no responder a este email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Informe Médico - ${config.sistema.clinicaNombre}
        
        Estimado/a {{pacienteNombre}},
        Adjunto encontrará su Informe Médico N° {{numero_informe}}, emitido el {{fecha_emision}}.
        Si tiene dudas o requiere aclaratorias, puede responder a este correo.
        
        Saludos cordiales,
        {{clinicaNombre}}
      `
    };
  }
}
