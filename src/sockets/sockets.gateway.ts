import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from '../chat/schemas/message.schema';
import { ChatRoom, ChatRoomDocument } from '../chat/schemas/chat-room.schema';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class SocketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketsGateway.name);

  // In-memory online user tracking (no Redis)
  // Map<userId, Set<socketId>>
  private onlineUsers: Map<string, Set<string>> = new Map();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(ChatRoom.name) private chatRoomModel: Model<ChatRoomDocument>,
    @InjectModel('User') private userModel: Model<any>,
  ) {}

  // ─── Connection Handling ────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without auth token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub;
      (client as any).userId = userId;
      (client as any).username = payload.username;

      // Track online user
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(client.id);

      // Join user's personal room for direct notifications
      client.join(`user:${userId}`);

      // Auto-join all chat rooms user belongs to
      const rooms = await this.chatRoomModel
        .find({ participants: new Types.ObjectId(userId) })
        .select('_id')
        .lean();

      rooms.forEach((room) => {
        client.join(`room:${room._id.toString()}`);
      });

      // Mark all pending messages as 'delivered' for this user
      const roomIds = rooms.map((r) => r._id);
      if (roomIds.length > 0) {
        const deliveredResult = await this.messageModel.updateMany(
          {
            roomId: { $in: roomIds },
            senderId: { $ne: new Types.ObjectId(userId) },
            readStatus: 'sent',
          },
          { $set: { readStatus: 'delivered' } },
        );

        if (deliveredResult.modifiedCount > 0) {
          // Notify all rooms that messages were delivered
          roomIds.forEach((roomId) => {
            this.server.to(`room:${roomId.toString()}`).emit('messages-delivered', {
              roomId: roomId.toString(),
              deliveredTo: userId,
            });
          });
        }
      }

      // Broadcast online status
      this.server.emit('user-online', { userId, username: payload.username });

      this.logger.log(`User ${payload.username} (${userId}) connected — socket ${client.id}`);
    } catch (error: any) {
      this.logger.warn(`Auth failed for socket ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    const username = (client as any).username;

    if (userId) {
      const userSockets = this.onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.onlineUsers.delete(userId);
          // Only emit offline when all sockets disconnected
          this.server.emit('user-offline', { userId, username });
          this.logger.log(`User ${username} (${userId}) went offline`);
        }
      }
    }
  }

  // ─── Chat Events ────────────────────────────────────────────

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(`room:${data.roomId}`);
    this.logger.debug(`Socket ${client.id} joined room:${data.roomId}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`room:${data.roomId}`);
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      content: string;
      mediaUrl?: string;
      iv?: string;
      isEncrypted?: boolean;
    },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    try {
      // Verify participant
      const room = await this.chatRoomModel.findById(data.roomId);
      if (!room) return;

      const isParticipant = room.participants.some(
        (p) => p.toString() === userId,
      );
      if (!isParticipant) return;

      // Determine receiverId for direct chats
      let receiverId: Types.ObjectId | undefined;
      if (room.type === 'direct') {
        const otherUser = room.participants.find((p) => p.toString() !== userId);
        receiverId = otherUser;
      }

      // DB FIRST — save message before emitting
      const message = await this.messageModel.create({
        senderId: new Types.ObjectId(userId),
        receiverId,
        roomId: new Types.ObjectId(data.roomId),
        content: data.content,
        mediaUrl: data.mediaUrl || '',
        iv: data.iv || '',
        isEncrypted: data.isEncrypted || false,
      });

      // Update room's lastMessage
      await this.chatRoomModel.findByIdAndUpdate(data.roomId, {
        lastMessage: message._id,
      });

      // Populate and emit
      const populatedMessage = await this.messageModel
        .findById(message._id)
        .populate('senderId', 'username name avatar')
        .lean();

      // Emit to all in room
      this.server.to(`room:${data.roomId}`).emit('new-message', {
        ...populatedMessage,
        roomId: data.roomId,
      });

      // Emit to individual users for notification purposes
      room.participants.forEach((participantId) => {
        if (participantId.toString() !== userId) {
          this.server.to(`user:${participantId.toString()}`).emit('message-notification', {
            roomId: data.roomId,
            message: populatedMessage,
          });
        }
      });
    } catch (error: any) {
      this.logger.error(`Error sending message: ${error.message}`);
      client.emit('message-error', { error: 'Failed to send message' });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId;
    const username = (client as any).username;
    client.to(`room:${data.roomId}`).emit('user-typing', {
      userId,
      username,
      roomId: data.roomId,
    });
  }

  @SubscribeMessage('stop-typing')
  handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId;
    client.to(`room:${data.roomId}`).emit('user-stop-typing', {
      userId,
      roomId: data.roomId,
    });
  }

  @SubscribeMessage('mark-read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    await this.messageModel.updateMany(
      {
        roomId: new Types.ObjectId(data.roomId),
        senderId: { $ne: new Types.ObjectId(userId) },
        readStatus: { $ne: 'read' },
      },
      { $set: { readStatus: 'read' } },
    );

    // Notify sender that messages were read
    client.to(`room:${data.roomId}`).emit('messages-read', {
      roomId: data.roomId,
      readBy: userId,
    });
  }

  @SubscribeMessage('mark-delivered')
  async handleMarkDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    await this.messageModel.updateMany(
      {
        roomId: new Types.ObjectId(data.roomId),
        senderId: { $ne: new Types.ObjectId(userId) },
        readStatus: 'sent',
      },
      { $set: { readStatus: 'delivered' } },
    );

    client.to(`room:${data.roomId}`).emit('messages-delivered', {
      roomId: data.roomId,
      deliveredTo: userId,
    });
  }

  // ─── Call Signaling ─────────────────────────────────────────

  @SubscribeMessage('call-user')
  async handleCallUser(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      targetUserId: string;
      channelName: string;
      callType: 'audio' | 'video';
    },
  ) {
    const callerId = (client as any).userId;
    const callerUsername = (client as any).username;

    // Fetch the caller's actual name from the DB
    const caller = await this.userModel.findById(callerId).select('name username avatar').lean();
    const callerName = caller?.name || callerUsername;

    this.server.to(`user:${data.targetUserId}`).emit('incoming-call', {
      callerId,
      callerUsername: callerName, // We pass the display name but keep the property for compatibility
      channelName: data.channelName,
      callType: data.callType,
      callerAvatar: caller?.avatar,
    });
  }

  @SubscribeMessage('call-accepted')
  handleCallAccepted(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callerId: string; channelName: string },
  ) {
    const accepterId = (client as any).userId;
    this.server.to(`user:${data.callerId}`).emit('call-accepted', {
      accepterId,
      channelName: data.channelName,
    });
  }

  @SubscribeMessage('call-rejected')
  handleCallRejected(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callerId: string; channelName: string },
  ) {
    this.server.to(`user:${data.callerId}`).emit('call-rejected', {
      channelName: data.channelName,
    });
  }

  @SubscribeMessage('call-ended')
  handleCallEnded(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string; channelName: string },
  ) {
    this.server.to(`user:${data.targetUserId}`).emit('call-ended', {
      channelName: data.channelName,
    });
  }

  // ─── Utility ────────────────────────────────────────────────

  @SubscribeMessage('get-online-users')
  handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    const onlineUserIds = Array.from(this.onlineUsers.keys());
    client.emit('online-users', { users: onlineUserIds });
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId) && this.onlineUsers.get(userId)!.size > 0;
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }

  // Emit event to a specific user (used by other services)
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Emit event to a room
  emitToRoom(roomId: string, event: string, data: any) {
    this.server.to(`room:${roomId}`).emit(event, data);
  }
}
