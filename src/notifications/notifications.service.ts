import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: any;

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {
    this.initFirebase();
  }

  private async initFirebase() {
    try {
      const admin = await import('firebase-admin');
      const projectId = this.configService.get<string>('FCM_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FCM_PRIVATE_KEY');

      if (projectId && clientEmail && privateKey) {
        this.firebaseApp = admin.apps.length
          ? admin.app()
          : admin.initializeApp({
              credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey: privateKey.replace(/\\n/g, '\n'),
              }),
            });
        this.logger.log('Firebase Admin initialized');
      } else {
        this.logger.warn('Firebase credentials not configured — push notifications disabled');
      }
    } catch (error) {
      this.logger.warn(`Firebase init failed: ${error?.message}`);
    }
  }

  async create(
    userId: string,
    type: string,
    data: Record<string, any>,
    socketGateway?: any,
  ): Promise<NotificationDocument> {
    const notification = await this.notificationModel.create({
      userId: new Types.ObjectId(userId),
      type,
      data,
    });

    // Real-time notification via Socket.io
    if (socketGateway) {
      socketGateway.emitToUser(userId, 'notification', {
        ...notification.toObject(),
      });
    }

    // FCM push notification if user is offline
    if (socketGateway && !socketGateway.isUserOnline(userId)) {
      await this.sendPushNotification(userId, type, data);
    }

    return notification;
  }

  async getUserNotifications(userId: string, cursor?: string, limit = 20): Promise<any> {
    const query: any = { userId: new Types.ObjectId(userId) };
    if (cursor) {
      query._id = { $lt: new Types.ObjectId(cursor) };
    }

    const notifications = await this.notificationModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = notifications.length > limit;
    const results = hasMore ? notifications.slice(0, limit) : notifications;

    return {
      notifications: results,
      nextCursor: hasMore ? results[results.length - 1]._id : null,
      hasMore,
    };
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.notificationModel.findByIdAndUpdate(notificationId, { isRead: true });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true } },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });
  }

  private async sendPushNotification(userId: string, type: string, data: Record<string, any>): Promise<void> {
    if (!this.firebaseApp) return;

    try {
      const user = await this.userModel.findById(userId).select('fcmToken').lean();
      if (!user?.fcmToken) return;

      const admin = await import('firebase-admin');
      const titles: Record<string, string> = {
        friend_request: 'New Friend Request',
        friend_accepted: 'Friend Request Accepted',
        message: 'New Message',
        like: 'Someone liked your post',
        comment: 'New Comment',
        share: 'Someone shared your post',
        call: 'Incoming Call',
      };

      await admin.messaging().send({
        token: user.fcmToken,
        notification: {
          title: titles[type] || 'FlickSync',
          body: data.message || `You have a new ${type} notification`,
        },
        data: {
          type,
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)]),
          ),
        },
      });

      this.logger.debug(`FCM push sent to user ${userId}`);
    } catch (error) {
      this.logger.error(`FCM push failed: ${error?.message}`);
    }
  }
}
