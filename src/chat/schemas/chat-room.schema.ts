import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatRoomDocument = ChatRoom & Document;

@Schema({ timestamps: true })
export class ChatRoom {
  @Prop({ default: '' })
  name: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  participants: Types.ObjectId[];

  @Prop({ default: 'direct', enum: ['direct', 'group'] })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  lastMessage: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  admin: Types.ObjectId;

  @Prop({ default: '' })
  avatar: string;
}

export const ChatRoomSchema = SchemaFactory.createForClass(ChatRoom);

ChatRoomSchema.index({ participants: 1 });
ChatRoomSchema.index({ type: 1 });
ChatRoomSchema.index({ updatedAt: -1 });
