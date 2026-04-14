import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS configuration for Capacitor + Web
  const clientUrls = configService
    .get<string>('CLIENT_URLS', 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim());

  app.enableCors({
    origin: clientUrls,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Socket.io adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);
  console.log(`🚀 FlickSync API running on port ${port}`);
}
bootstrap();
