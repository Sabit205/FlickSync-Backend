import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true, trim: true, lowercase: true })
  username: string;

  @Prop({ default: '' })
  name: string;

  @Prop({ required: true, unique: true, index: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ default: '' })
  bio: string;

  @Prop({ default: '' })
  location: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  friends: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  blockedUsers: Types.ObjectId[];

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  onboardingCompleted: boolean;

  @Prop({ default: null })
  verificationToken: string;

  @Prop({ default: null })
  resetPasswordToken: string;

  @Prop({ default: null })
  resetPasswordExpires: Date;

  @Prop({ default: 'public', enum: ['public', 'private'] })
  profileVisibility: string;

  @Prop({ default: null })
  publicKey: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  pendingFriendRequests: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sentFriendRequests: Types.ObjectId[];

  @Prop({ default: null })
  fcmToken: string;

  @Prop({ default: null })
  refreshToken: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Text index for search
UserSchema.index({ username: 'text', email: 'text' });
UserSchema.index({ verificationToken: 1 });
UserSchema.index({ resetPasswordToken: 1 });
