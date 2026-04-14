import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CallsService } from './calls.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('calls')
@UseGuards(AuthGuard('jwt'))
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('token')
  async getToken(
    @Query('channelName') channelName: string,
    @Query('uid') uid: number,
  ) {
    return this.callsService.generateToken(channelName, uid || 0);
  }

  @Post('record')
  async createCallRecord(
    @CurrentUser('sub') callerId: string,
    @Body('receiverId') receiverId: string,
    @Body('channelName') channelName: string,
    @Body('callType') callType: string,
  ) {
    return this.callsService.createCallRecord(callerId, receiverId, channelName, callType);
  }

  @Post('status')
  async updateCallStatus(
    @Body('channelName') channelName: string,
    @Body('status') status: string,
    @Body('duration') duration?: number,
  ) {
    await this.callsService.updateCallStatus(channelName, status, duration);
    return { message: 'Call status updated' };
  }

  @Get('history')
  async getCallHistory(@CurrentUser('sub') userId: string) {
    return this.callsService.getCallHistory(userId);
  }
}
