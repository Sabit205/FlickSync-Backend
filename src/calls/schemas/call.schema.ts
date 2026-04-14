import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallDocument = Call & Document;

@Schema({ timestamps: true })
export class Call {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  callerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiverId: Types.ObjectId;

  @Prop({ required: true })
  channelName: string;

  @Prop({ default: 'audio', enum: ['audio', 'video'] })
  type: string;

  @Prop({ default: 'ringing', enum: ['ringing', 'accepted', 'ended', 'missed', 'rejected'] })
  status: string;

  @Prop({ default: 0 })
  duration: number;

  @Prop({ default: null })
  endedAt: Date;
}

export const CallSchema = SchemaFactory.createForClass(Call);

CallSchema.index({ callerId: 1, createdAt: -1 });
CallSchema.index({ receiverId: 1, createdAt: -1 });
