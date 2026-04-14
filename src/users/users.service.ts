import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('-password -refreshToken');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username: username.toLowerCase() });
  }

  async findByVerificationToken(token: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ verificationToken: token });
  }

  async findByResetToken(token: string): Promise<UserDocument | null> {
    return this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });
  }

  async getProfile(userId: string, requesterId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshToken -verificationToken -resetPasswordToken -resetPasswordExpires')
      .populate('friends', 'username name avatar')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    // Check if blocked
    const blockedIds = (user.blockedUsers || []).map((id: any) => id.toString());
    if (blockedIds.includes(requesterId)) {
      throw new ForbiddenException('You cannot view this profile');
    }

    // Check privacy
    if (user.profileVisibility === 'private' && userId !== requesterId) {
      const friendIds = (user.friends || []).map((f: any) => f._id?.toString() || f.toString());
      if (!friendIds.includes(requesterId)) {
        return {
          _id: user._id,
          username: user.username,
          avatar: user.avatar,
          profileVisibility: 'private',
          isFriend: false,
        };
      }
    }

    const friendIds = (user.friends || []).map((f: any) => f._id?.toString() || f.toString());
    return {
      ...user,
      isFriend: friendIds.includes(requesterId),
      friendCount: user.friends?.length || 0,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: dto }, { new: true })
      .select('-password -refreshToken');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async searchUsers(query: string, currentUserId: string): Promise<UserDocument[]> {
    return this.userModel
      .find({
        $and: [
          { _id: { $ne: new Types.ObjectId(currentUserId) } },
          {
            $or: [
              { username: { $regex: query, $options: 'i' } },
              { email: { $regex: query, $options: 'i' } },
            ],
          },
        ],
      })
      .select('username name avatar bio profileVisibility')
      .limit(20)
      .lean();
  }

  // ─── Friend Request System ───────────────────────────────────

  async sendFriendRequest(senderId: string, receiverId: string): Promise<{ message: string }> {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const [sender, receiver] = await Promise.all([
      this.userModel.findById(senderId),
      this.userModel.findById(receiverId),
    ]);

    if (!receiver) throw new NotFoundException('User not found');
    if (!sender) throw new NotFoundException('Sender not found');

    // Check if blocked
    if (receiver.blockedUsers.map((id) => id.toString()).includes(senderId)) {
      throw new ForbiddenException('Cannot send friend request to this user');
    }
    if (sender.blockedUsers.map((id) => id.toString()).includes(receiverId)) {
      throw new ForbiddenException('Unblock user before sending a friend request');
    }

    // Check if already friends
    if (sender.friends.map((id) => id.toString()).includes(receiverId)) {
      throw new BadRequestException('Already friends with this user');
    }

    // Check if request already sent
    if (sender.sentFriendRequests.map((id) => id.toString()).includes(receiverId)) {
      throw new BadRequestException('Friend request already sent');
    }

    // Check if there's a pending request from receiver
    if (sender.pendingFriendRequests.map((id) => id.toString()).includes(receiverId)) {
      // Auto-accept
      return this.acceptFriendRequest(senderId, receiverId);
    }

    await Promise.all([
      this.userModel.findByIdAndUpdate(senderId, {
        $addToSet: { sentFriendRequests: new Types.ObjectId(receiverId) },
      }),
      this.userModel.findByIdAndUpdate(receiverId, {
        $addToSet: { pendingFriendRequests: new Types.ObjectId(senderId) },
      }),
    ]);

    return { message: 'Friend request sent' };
  }

  async acceptFriendRequest(userId: string, requesterId: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!user.pendingFriendRequests.map((id) => id.toString()).includes(requesterId)) {
      throw new BadRequestException('No pending friend request from this user');
    }

    await Promise.all([
      this.userModel.findByIdAndUpdate(userId, {
        $addToSet: { friends: new Types.ObjectId(requesterId) },
        $pull: { pendingFriendRequests: new Types.ObjectId(requesterId) },
      }),
      this.userModel.findByIdAndUpdate(requesterId, {
        $addToSet: { friends: new Types.ObjectId(userId) },
        $pull: { sentFriendRequests: new Types.ObjectId(userId) },
      }),
    ]);

    return { message: 'Friend request accepted' };
  }

  async rejectFriendRequest(userId: string, requesterId: string): Promise<{ message: string }> {
    await Promise.all([
      this.userModel.findByIdAndUpdate(userId, {
        $pull: { pendingFriendRequests: new Types.ObjectId(requesterId) },
      }),
      this.userModel.findByIdAndUpdate(requesterId, {
        $pull: { sentFriendRequests: new Types.ObjectId(userId) },
      }),
    ]);

    return { message: 'Friend request rejected' };
  }

  async unfriend(userId: string, friendId: string): Promise<{ message: string }> {
    await Promise.all([
      this.userModel.findByIdAndUpdate(userId, {
        $pull: { friends: new Types.ObjectId(friendId) },
      }),
      this.userModel.findByIdAndUpdate(friendId, {
        $pull: { friends: new Types.ObjectId(userId) },
      }),
    ]);

    return { message: 'Friend removed' };
  }

  async blockUser(userId: string, targetId: string): Promise<{ message: string }> {
    if (userId === targetId) {
      throw new BadRequestException('Cannot block yourself');
    }

    // Block + unfriend + remove any pending requests
    await Promise.all([
      this.userModel.findByIdAndUpdate(userId, {
        $addToSet: { blockedUsers: new Types.ObjectId(targetId) },
        $pull: {
          friends: new Types.ObjectId(targetId),
          pendingFriendRequests: new Types.ObjectId(targetId),
          sentFriendRequests: new Types.ObjectId(targetId),
        },
      }),
      this.userModel.findByIdAndUpdate(targetId, {
        $pull: {
          friends: new Types.ObjectId(userId),
          pendingFriendRequests: new Types.ObjectId(userId),
          sentFriendRequests: new Types.ObjectId(userId),
        },
      }),
    ]);

    return { message: 'User blocked' };
  }

  async unblockUser(userId: string, targetId: string): Promise<{ message: string }> {
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { blockedUsers: new Types.ObjectId(targetId) },
    });

    return { message: 'User unblocked' };
  }

  async getFriends(userId: string): Promise<any[]> {
    const user = await this.userModel
      .findById(userId)
      .populate('friends', 'username name avatar bio')
      .lean();
    return user?.friends || [];
  }

  async getPendingFriendRequests(userId: string): Promise<any[]> {
    const user = await this.userModel
      .findById(userId)
      .populate('pendingFriendRequests', 'username name avatar bio')
      .lean();
    return user?.pendingFriendRequests || [];
  }

  async getSentFriendRequests(userId: string): Promise<any[]> {
    const user = await this.userModel
      .findById(userId)
      .populate('sentFriendRequests', 'username name avatar bio')
      .lean();
    return user?.sentFriendRequests || [];
  }

  // ─── E2E Encryption Keys ────────────────────────────────────

  async storePublicKey(userId: string, publicKey: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { publicKey });
  }

  async getPublicKey(userId: string): Promise<string | null> {
    const user = await this.userModel.findById(userId).select('publicKey').lean();
    return user?.publicKey || null;
  }

  // ─── FCM Token ──────────────────────────────────────────────

  async updateFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { fcmToken });
  }

  async getFcmToken(userId: string): Promise<string | null> {
    const user = await this.userModel.findById(userId).select('fcmToken').lean();
    return user?.fcmToken || null;
  }
}
