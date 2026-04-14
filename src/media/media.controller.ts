import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(AuthGuard('jwt'))
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('signature')
  async getSignature(@Body('folder') folder?: string) {
    return this.mediaService.generateSignature(folder);
  }
}
