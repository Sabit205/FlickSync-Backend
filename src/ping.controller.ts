import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('ping')
export class PingController {
  @Get()
  @SkipThrottle()
  ping() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
