import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.split(' ')[1];

      if (!token) {
        throw new WsException('Authentication token not found');
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Attach user to socket data
      (client as any).user = payload;
      return true;
    } catch (error) {
      throw new WsException('Invalid authentication token');
    }
  }
}
