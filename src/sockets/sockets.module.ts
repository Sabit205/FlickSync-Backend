import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SocketsGateway } from './sockets.gateway';
import { Message, MessageSchema } from '../chat/schemas/message.schema';
import { ChatRoom, ChatRoomSchema } from '../chat/schemas/chat-room.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: ChatRoom.name, schema: ChatRoomSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [SocketsGateway],
  exports: [SocketsGateway],
})
export class SocketsModule {}
