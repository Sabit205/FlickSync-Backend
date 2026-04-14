import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/object-id-validation.pipe';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getUserNotifications(userId, cursor, limit || 20);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('sub') userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id', ParseObjectIdPipe) id: string) {
    await this.notificationsService.markAsRead(id);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser('sub') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { message: 'All notifications marked as read' };
  }
}
