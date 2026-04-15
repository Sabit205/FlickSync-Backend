import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/object-id-validation.pipe';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser('sub') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('search')
  async searchUsers(
    @Query('q') query: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.usersService.searchUsers(query || '', userId);
  }

  @Get('friends')
  async getFriends(@CurrentUser('sub') userId: string) {
    return this.usersService.getFriends(userId);
  }

  @Get('friend-requests')
  async getPendingRequests(@CurrentUser('sub') userId: string) {
    return this.usersService.getPendingFriendRequests(userId);
  }

  @Get('friend-requests/sent')
  async getSentRequests(@CurrentUser('sub') userId: string) {
    return this.usersService.getSentFriendRequests(userId);
  }

  @Post('friend-request/:id')
  async sendFriendRequest(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseObjectIdPipe) targetId: string,
  ) {
    return this.usersService.sendFriendRequest(userId, targetId);
  }

  @Post('friend-request/:id/accept')
  async acceptFriendRequest(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseObjectIdPipe) requesterId: string,
  ) {
    return this.usersService.acceptFriendRequest(userId, requesterId);
  }

  @Post('friend-request/:id/reject')
  async rejectFriendRequest(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseObjectIdPipe) requesterId: string,
  ) {
    return this.usersService.rejectFriendRequest(userId, requesterId);
  }

  @Post('unfriend/:id')
  async unfriend(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseObjectIdPipe) friendId: string,
  ) {
    return this.usersService.unfriend(userId, friendId);
  }

  @Post('block/:id')
  async blockUser(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseObjectIdPipe) targetId: string,
  ) {
    return this.usersService.blockUser(userId, targetId);
  }

  @Post('unblock/:id')
  async unblockUser(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseObjectIdPipe) targetId: string,
  ) {
    return this.usersService.unblockUser(userId, targetId);
  }

  @Get('public-key/:id')
  async getPublicKey(@Param('id', ParseObjectIdPipe) userId: string) {
    const key = await this.usersService.getPublicKey(userId);
    return { publicKey: key };
  }

  @Post('public-key')
  async storePublicKey(
    @CurrentUser('sub') userId: string,
    @Body('publicKey') publicKey: string,
  ) {
    await this.usersService.storePublicKey(userId, publicKey);
    return { message: 'Public key stored' };
  }

  @Post('fcm-token')
  async updateFcmToken(
    @CurrentUser('sub') userId: string,
    @Body('fcmToken') fcmToken: string,
  ) {
    await this.usersService.updateFcmToken(userId, fcmToken);
    return { message: 'FCM token updated' };
  }

  @Get('blocked')
  async getBlockedUsers(@CurrentUser('sub') userId: string) {
    return this.usersService.getBlockedUsers(userId);
  }

  @Get(':id')
  async getProfile(
    @Param('id', ParseObjectIdPipe) userId: string,
    @CurrentUser('sub') requesterId: string,
  ) {
    return this.usersService.getProfile(userId, requesterId);
  }
}
