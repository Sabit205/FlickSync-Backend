import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

@Schema({ timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: '' })
  content: string;

  @Prop({ type: [String], default: [] })
  mediaUrls: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  likes: Types.ObjectId[];

  @Prop({ type: [CommentSchema], default: [] })
  comments: Comment[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  shares: Types.ObjectId[];

  @Prop({ default: 'public', enum: ['public', 'friends', 'private'] })
  visibility: string;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Indices for feed pagination performance
PostSchema.index({ createdAt: -1 });
PostSchema.index({ userId: 1, createdAt: -1 });
