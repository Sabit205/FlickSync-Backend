import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Call, CallDocument } from './schemas/call.schema';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    private configService: ConfigService,
  ) {}

  async generateToken(channelName: string, uid: number): Promise<{ token: string }> {
    const appId = this.configService.get<string>('AGORA_APP_ID');
    const appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE');

    if (!appId || !appCertificate) {
      this.logger.warn('Agora credentials not configured');
      return { token: '' };
    }

    try {
      const { RtcTokenBuilder, RtcRole } = require('agora-token');

      const expirationTimeInSeconds = 3600; // 1 hour
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

      const token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        RtcRole.PUBLISHER,
        privilegeExpiredTs,
        privilegeExpiredTs,
      );

      return { token };
    } catch (error) {
      this.logger.error(`Agora token generation failed: ${error?.message}`);
      return { token: '' };
    }
  }

  async createCallRecord(callerId: string, receiverId: string, channelName: string, callType: string): Promise<CallDocument> {
    return this.callModel.create({
      callerId: new Types.ObjectId(callerId),
      receiverId: new Types.ObjectId(receiverId),
      channelName,
      type: callType,
      status: 'ringing',
    });
  }

  async updateCallStatus(channelName: string, status: string, duration?: number): Promise<void> {
    const update: any = { status };
    if (status === 'ended') {
      update.endedAt = new Date();
      if (duration) update.duration = duration;
    }
    await this.callModel.findOneAndUpdate({ channelName }, update);
  }

  async getCallHistory(userId: string, limit = 20): Promise<CallDocument[]> {
    return this.callModel
      .find({
        $or: [
          { callerId: new Types.ObjectId(userId) },
          { receiverId: new Types.ObjectId(userId) },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('callerId', 'username avatar')
      .populate('receiverId', 'username avatar')
      .lean();
  }
}
