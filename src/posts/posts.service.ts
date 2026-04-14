import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(userId: string, dto: CreatePostDto): Promise<any> {
    const post = await this.postModel.create({
      userId: new Types.ObjectId(userId),
      content: dto.content,
      mediaUrls: dto.mediaUrls || [],
      visibility: dto.visibility || 'public',
    });

    return this.postModel
      .findById(post._id)
      .populate('userId', 'username avatar')
      .lean();
  }

  async getFeed(currentUserId: string, cursor?: string, limit = 20): Promise<any> {
    const user = await this.userModel.findById(currentUserId).lean();
    if (!user) throw new NotFoundException('User not found');

    const friendIds = user.friends.map((id) => id.toString());
    const blockedIds = user.blockedUsers.map((id) => id.toString());

    // Build query: own posts + friends' posts + public posts (excluding blocked users)
    const query: any = {
      $and: [
        { userId: { $nin: blockedIds.map((id) => new Types.ObjectId(id)) } },
        {
          $or: [
            { userId: new Types.ObjectId(currentUserId) },
            { userId: { $in: friendIds.map((id) => new Types.ObjectId(id)) }, visibility: { $in: ['public', 'friends'] } },
            { visibility: 'public', userId: { $nin: [new Types.ObjectId(currentUserId), ...friendIds.map((id) => new Types.ObjectId(id))] } },
          ],
        },
      ],
    };

    // Cursor-based pagination
    if (cursor) {
      query.$and.push({ _id: { $lt: new Types.ObjectId(cursor) } });
    }

    const posts = await this.postModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1) // Fetch one extra to check if there are more
      .populate('userId', 'username avatar')
      .populate('comments.userId', 'username avatar')
      .lean();

    const hasMore = posts.length > limit;
    const results = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = results.length > 0 ? results[results.length - 1]._id : null;

    return {
      posts: results.map((post) => ({
        ...post,
        likeCount: post.likes?.length || 0,
        commentCount: post.comments?.length || 0,
        shareCount: post.shares?.length || 0,
        isLiked: post.likes?.some((id: any) => id.toString() === currentUserId) || false,
      })),
      nextCursor: hasMore ? nextCursor : null,
      hasMore,
    };
  }

  async getUserPosts(userId: string, currentUserId: string, cursor?: string, limit = 20): Promise<any> {
    const query: any = { userId: new Types.ObjectId(userId) };

    // If not viewing own posts, respect visibility
    if (userId !== currentUserId) {
      const currentUser = await this.userModel.findById(currentUserId).lean();
      const isFriend = currentUser?.friends?.map((id) => id.toString()).includes(userId);

      if (isFriend) {
        query.visibility = { $in: ['public', 'friends'] };
      } else {
        query.visibility = 'public';
      }
    }

    if (cursor) {
      query._id = { $lt: new Types.ObjectId(cursor) };
    }

    const posts = await this.postModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('userId', 'username avatar')
      .populate('comments.userId', 'username avatar')
      .lean();

    const hasMore = posts.length > limit;
    const results = hasMore ? posts.slice(0, limit) : posts;

    return {
      posts: results.map((post) => ({
        ...post,
        likeCount: post.likes?.length || 0,
        commentCount: post.comments?.length || 0,
        shareCount: post.shares?.length || 0,
        isLiked: post.likes?.some((id: any) => id.toString() === currentUserId) || false,
      })),
      nextCursor: hasMore ? results[results.length - 1]._id : null,
      hasMore,
    };
  }

  async getById(postId: string, currentUserId: string): Promise<any> {
    const post = await this.postModel
      .findById(postId)
      .populate('userId', 'username avatar')
      .populate('comments.userId', 'username avatar')
      .lean();

    if (!post) throw new NotFoundException('Post not found');

    return {
      ...post,
      likeCount: post.likes?.length || 0,
      commentCount: post.comments?.length || 0,
      shareCount: post.shares?.length || 0,
      isLiked: post.likes?.some((id: any) => id.toString() === currentUserId) || false,
    };
  }

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found');

    const userObjId = new Types.ObjectId(userId);
    const isLiked = post.likes.some((id) => id.toString() === userId);

    if (isLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(userObjId);
    }

    await post.save();

    return { liked: !isLiked, likeCount: post.likes.length };
  }

  async addComment(postId: string, userId: string, content: string): Promise<any> {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found');

    const comment = {
      userId: new Types.ObjectId(userId),
      content,
      createdAt: new Date(),
    };

    post.comments.push(comment as any);
    await post.save();

    // Return the new comment with populated user
    const updatedPost = await this.postModel
      .findById(postId)
      .populate('comments.userId', 'username avatar')
      .lean();

    const newComment = updatedPost!.comments[updatedPost!.comments.length - 1];
    return { comment: newComment, commentCount: updatedPost!.comments.length };
  }

  async sharePost(postId: string, userId: string): Promise<{ shareCount: number }> {
    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $addToSet: { shares: new Types.ObjectId(userId) } },
      { new: true },
    );
    if (!post) throw new NotFoundException('Post not found');

    return { shareCount: post.shares.length };
  }

  async deletePost(postId: string, userId: string): Promise<{ message: string }> {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found');

    if (post.userId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await this.postModel.findByIdAndDelete(postId);
    return { message: 'Post deleted' };
  }
}
