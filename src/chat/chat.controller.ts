import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/object-id-validation.pipe';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  async getRooms(@CurrentUser('sub') userId: string) {
    return this.chatService.getUserRooms(userId);
  }

  @Post('rooms')
  async createGroupRoom(
    @CurrentUser('sub') userId: string,
    @Body('name') name: string,
    @Body('participants') participants: string[],
  ) {
    return this.chatService.createGroupRoom(userId, name, participants);
  }

  @Get('rooms/:roomId')
  async getRoom(
    @Param('roomId', ParseObjectIdPipe) roomId: string,
  ) {
    return this.chatService.getRoomById(roomId);
  }

  @Get('rooms/:roomId/messages')
  async getMessages(
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatService.getMessages(roomId, userId, cursor, limit || 50);
  }

  @Patch('rooms/:roomId/read')
  async markAsRead(
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.chatService.markAsRead(roomId, userId);
    return { message: 'Messages marked as read' };
  }

  @Get('direct/:userId')
  async getDirectRoom(
    @Param('userId', ParseObjectIdPipe) targetUserId: string,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.chatService.getOrCreateDirectRoom(currentUserId, targetUserId);
  }

  @Post('message')
  async sendMessage(
    @CurrentUser('sub') userId: string,
    @Body('roomId') roomId: string,
    @Body('content') content: string,
    @Body('mediaUrl') mediaUrl?: string,
    @Body('iv') iv?: string,
    @Body('isEncrypted') isEncrypted?: boolean,
  ) {
    return this.chatService.sendMessage(userId, roomId, content, mediaUrl, iv, isEncrypted);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('sub') userId: string) {
    const count = await this.chatService.getUnreadCount(userId);
    return { count };
  }
}
