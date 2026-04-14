import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatRoom, ChatRoomDocument } from './schemas/chat-room.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatRoom.name) private chatRoomModel: Model<ChatRoomDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  // ─── Room Management ────────────────────────────────────────

  async getOrCreateDirectRoom(userId1: string, userId2: string): Promise<ChatRoomDocument> {
    const objId1 = new Types.ObjectId(userId1);
    const objId2 = new Types.ObjectId(userId2);

    // Find existing direct room between these two users
    let room = await this.chatRoomModel.findOne({
      type: 'direct',
      participants: { $all: [objId1, objId2], $size: 2 },
    });

    if (!room) {
      room = await this.chatRoomModel.create({
        type: 'direct',
        participants: [objId1, objId2],
      });
    }

    return room;
  }

  async createGroupRoom(creatorId: string, name: string, participantIds: string[]): Promise<ChatRoomDocument> {
    const allParticipants = [
      new Types.ObjectId(creatorId),
      ...participantIds.map((id) => new Types.ObjectId(id)),
    ];

    // Remove duplicates
    const uniqueParticipants = [...new Map(allParticipants.map((id) => [id.toString(), id])).values()];

    const room = await this.chatRoomModel.create({
      type: 'group',
      name,
      participants: uniqueParticipants,
      admin: new Types.ObjectId(creatorId),
    });

    return room;
  }

  async getUserRooms(userId: string): Promise<any[]> {
    const rooms = await this.chatRoomModel
      .find({ participants: new Types.ObjectId(userId) })
      .populate('participants', 'username name avatar')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: 'username name' },
      })
      .sort({ updatedAt: -1 })
      .lean();

    return rooms.map((room) => {
      // For direct chats, show the other person's info
      if (room.type === 'direct') {
        const otherUser = room.participants.find(
          (p: any) => p._id.toString() !== userId,
        );
        return {
          ...room,
          displayName: (otherUser as any)?.name || (otherUser as any)?.username || 'Unknown',
          displayAvatar: (otherUser as any)?.avatar || '',
        };
      }
      return {
        ...room,
        displayName: room.name,
        displayAvatar: room.avatar,
      };
    });
  }

  async getRoomById(roomId: string): Promise<ChatRoomDocument> {
    const room = await this.chatRoomModel
      .findById(roomId)
      .populate('participants', 'username name avatar');
    if (!room) throw new NotFoundException('Chat room not found');
    return room;
  }

  // ─── Messages ───────────────────────────────────────────────

  async sendMessage(
    senderId: string,
    roomId: string,
    content: string,
    mediaUrl?: string,
    iv?: string,
    isEncrypted?: boolean,
  ): Promise<any> {
    // Verify sender is a participant
    const room = await this.chatRoomModel.findById(roomId);
    if (!room) throw new NotFoundException('Chat room not found');

    const isParticipant = room.participants.some(
      (p) => p.toString() === senderId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    // Determine receiverId for direct chats
    let receiverId: Types.ObjectId | undefined;
    if (room.type === 'direct') {
      const otherUser = room.participants.find((p) => p.toString() !== senderId);
      receiverId = otherUser;
    }

    // MUST save to DB first before any socket emission
    const message = await this.messageModel.create({
      senderId: new Types.ObjectId(senderId),
      receiverId,
      roomId: new Types.ObjectId(roomId),
      content,
      mediaUrl: mediaUrl || '',
      iv: iv || '',
      isEncrypted: isEncrypted || false,
    });

    // Update room's lastMessage
    await this.chatRoomModel.findByIdAndUpdate(roomId, {
      lastMessage: message._id,
    });

    // Return populated message
    return this.messageModel
      .findById(message._id)
      .populate('senderId', 'username name avatar')
      .lean();
  }

  async getMessages(
    roomId: string,
    userId: string,
    cursor?: string,
    limit = 50,
  ): Promise<any> {
    // Verify participant
    const room = await this.chatRoomModel.findById(roomId);
    if (!room) throw new NotFoundException('Chat room not found');

    const isParticipant = room.participants.some(
      (p) => p.toString() === userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    const query: any = { roomId: new Types.ObjectId(roomId) };
    if (cursor) {
      query._id = { $lt: new Types.ObjectId(cursor) };
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('senderId', 'username name avatar')
      .lean();

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: results.reverse(), // Oldest first for display
      nextCursor: hasMore ? results[0]._id : null,
      hasMore,
    };
  }

  async markAsRead(roomId: string, userId: string): Promise<void> {
    await this.messageModel.updateMany(
      {
        roomId: new Types.ObjectId(roomId),
        senderId: { $ne: new Types.ObjectId(userId) },
        readStatus: { $ne: 'read' },
      },
      { $set: { readStatus: 'read' } },
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Get all rooms user is in
    const rooms = await this.chatRoomModel
      .find({ participants: new Types.ObjectId(userId) })
      .select('_id')
      .lean();

    const roomIds = rooms.map((r) => r._id);

    return this.messageModel.countDocuments({
      roomId: { $in: roomIds },
      senderId: { $ne: new Types.ObjectId(userId) },
      readStatus: { $ne: 'read' },
    });
  }
}
