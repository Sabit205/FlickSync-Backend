import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '././auth/auth.module';
import { UsersModule } from '././users/users.module';
import { PostsModule } from '././posts/posts.module';
import { ChatModule } from '././chat/chat.module';
import { NotificationsModule } from '././notifications/notifications.module';
import { CallsModule } from '././calls/calls.module';
import { MailModule } from '././mail/mail.module';
import { MediaModule } from '././media/media.module';
import { SocketsModule } from '././sockets/sockets.module';
import { PingController } from './ping.controller';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // MongoDB connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),

    // Rate limiting: 60 requests per minute per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),

    // Feature modules
    AuthModule,
    UsersModule,
    PostsModule,
    ChatModule,
    NotificationsModule,
    CallsModule,
    MailModule,
    MediaModule,
    SocketsModule,
  ],
  controllers: [PingController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
