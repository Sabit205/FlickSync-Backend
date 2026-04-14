import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private cloudinary: any;

  constructor(private configService: ConfigService) {
    this.initCloudinary();
  }

  private async initCloudinary() {
    try {
      const { v2: cloudinary } = await import('cloudinary');
      const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
      const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
      const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

      if (cloudName && apiKey && apiSecret) {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });
        this.cloudinary = cloudinary;
        this.logger.log('Cloudinary initialized');
      } else {
        this.logger.warn('Cloudinary credentials not configured');
      }
    } catch (error) {
      this.logger.warn(`Cloudinary init failed: ${error?.message}`);
    }
  }

  async generateSignature(folder?: string): Promise<any> {
    if (!this.cloudinary) {
      return { error: 'Cloudinary not configured' };
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign: Record<string, any> = {
      timestamp,
      folder: folder || 'flicksync',
    };

    const signature = this.cloudinary.utils.api_sign_request(
      paramsToSign,
      this.configService.get<string>('CLOUDINARY_API_SECRET'),
    );

    return {
      signature,
      timestamp,
      apiKey: this.configService.get<string>('CLOUDINARY_API_KEY'),
      cloudName: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      folder: paramsToSign.folder,
    };
  }
}
