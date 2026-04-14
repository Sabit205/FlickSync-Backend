import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  receiverId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ChatRoom', required: true, index: true })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ default: '' })
  mediaUrl: string;

  @Prop({ default: '' })
  iv: string;

  @Prop({ default: 'sent', enum: ['sent', 'delivered', 'read'] })
  readStatus: string;

  @Prop({ default: false })
  isEncrypted: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
