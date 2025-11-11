import { Injectable } from '@nestjs/common';
import * as nodeMailer from 'nodemailer';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailTemplateService {
  private readonly transport: nodeMailer.Transporter;
  constructor(
    private logger: Logger,
    private configService: ConfigService,
  ) {
    const host = this.configService.get<string>('ZEPTO_HOST');
    const port = this.configService.get<number>('ZEPTO_PORT');
    const user = this.configService.get<string>('ZEPTO_USER');
    const pass = this.configService.get<string>('ZEPTO_PASS');

    // Log configuration (without password)
    this.logger.log(
      `Email config - Host: ${host}, Port: ${port}, User: ${user}`,
    );

    this.transport = nodeMailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000, // 10 seconds timeout
      greetingTimeout: 10000,
      socketTimeout: 10000,
      // For debugging
      debug: this.configService.get<string>('NODE_ENV') !== 'production',
      logger: this.configService.get<string>('NODE_ENV') !== 'production',
    });
  }

  async sendEmailTemplate(payload: nodeMailer.SendMailOptions) {
    try {
      // Verify connection before sending
      await this.transport.verify();

      await this.transport.sendMail({
        ...payload,
        from: '"Hello" <noreply@gaslessgossip.com>',
      });
      this.logger.log('Email sent successfully');
      return true;
    } catch (error) {
      this.logger.error(
        '🚀 ~ EmailTemplateService ~ sendEmailTemplate ~ error:',
        error,
      );

      // Provide more detailed error information
      if (error.code === 'ETIMEDOUT') {
        this.logger.error(
          'Email server connection timeout. Check network/firewall settings.',
        );
      } else if (error.code === 'ECONNREFUSED') {
        this.logger.error(
          'Email server refused connection. Check host and port.',
        );
      } else if (error.code === 'EAUTH') {
        this.logger.error('Email authentication failed. Check credentials.');
      }

      return false;
    }
  }
}
