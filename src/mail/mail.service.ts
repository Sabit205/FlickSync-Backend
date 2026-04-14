import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private brevoClient: any;
  private apiInstance: any;

  constructor(private configService: ConfigService) {
    this.initBrevo();
  }

  private async initBrevo() {
    try {
      const SibApiV3Sdk = await import('@getbrevo/brevo');
      this.apiInstance = new (SibApiV3Sdk as any).TransactionalEmailsApi();
      this.apiInstance.setApiKey(
        0, // TransactionalEmailsApiApiKeys.apiKey
        this.configService.get<string>('BREVO_API_KEY', ''),
      );
    } catch (error) {
      this.logger.warn('Brevo SDK initialization failed. Email sending will be disabled.', error?.message);
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const clientUrl = this.configService.get<string>('CLIENT_URL', 'http://localhost:3000');
    const verifyUrl = `${clientUrl}/verify-email?token=${token}`;
    const senderName = this.configService.get<string>('BREVO_SENDER_NAME', 'FlickSync');
    const senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL', 'noreply@flicksync.com');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0F0F14; color: #E2E8F0; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1A1A2E 0%, #16213E 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(124, 58, 237, 0.3);">
          <h1 style="color: #7C3AED; margin-bottom: 8px;">Welcome to FlickSync ✨</h1>
          <p style="color: #94A3B8; font-size: 16px;">Verify your email to get started.</p>
          <a href="${verifyUrl}" style="display: inline-block; margin-top: 24px; padding: 14px 32px; background: linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">Verify Email</a>
          <p style="margin-top: 24px; color: #64748B; font-size: 13px;">If you didn't create an account, please ignore this email.</p>
          <p style="margin-top: 8px; color: #64748B; font-size: 12px;">Or copy this link: ${verifyUrl}</p>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(email, `Verify your ${senderName} account`, htmlContent, senderEmail, senderName);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const clientUrl = this.configService.get<string>('CLIENT_URL', 'http://localhost:3000');
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;
    const senderName = this.configService.get<string>('BREVO_SENDER_NAME', 'FlickSync');
    const senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL', 'sabithasan2008@gmail.com');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0F0F14; color: #E2E8F0; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1A1A2E 0%, #16213E 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(124, 58, 237, 0.3);">
          <h1 style="color: #7C3AED; margin-bottom: 8px;">Reset Your Password 🔒</h1>
          <p style="color: #94A3B8; font-size: 16px;">Click the button below to reset your password.</p>
          <a href="${resetUrl}" style="display: inline-block; margin-top: 24px; padding: 14px 32px; background: linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">Reset Password</a>
          <p style="margin-top: 24px; color: #64748B; font-size: 13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(email, `Reset your ${senderName} password`, htmlContent, senderEmail, senderName);
  }

  private async sendEmail(to: string, subject: string, htmlContent: string, senderEmail: string, senderName: string): Promise<void> {
    if (!this.apiInstance) {
      this.logger.warn(`Email not sent (Brevo not configured): ${subject} → ${to}`);
      this.logger.debug(`Verification/Reset URL would have been sent to ${to}`);
      return;
    }

    try {
      const sendSmtpEmail = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
      };

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      this.logger.log(`Email sent: ${subject} → ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error?.message}`);
      // Don't throw — email failure shouldn't block user registration
    }
  }
}
