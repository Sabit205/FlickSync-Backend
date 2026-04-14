import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    // Check for existing user
    const existingEmail = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    const existingUsername = await this.userModel.findOne({ username: dto.username.toLowerCase() });
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Generate verification token
    const verificationToken = uuidv4();

    // Create user
    const user = await this.userModel.create({
      username: dto.username.toLowerCase(),
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      verificationToken,
      isEmailVerified: false,
    });

    // Send verification email
    await this.mailService.sendVerificationEmail(user.email, verificationToken);

    return {
      message: 'Registration successful. Please check your email to verify your account.',
      userId: user._id,
    };
  }

  async verifyEmail(token: string) {
    const user = await this.userModel.findOne({ verificationToken: token });
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    user.isEmailVerified = true;
    user.verificationToken = null as any;
    await user.save();

    return { message: 'Email verified successfully. You can now log in.' };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    // Generate tokens
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      username: user.username,
    };

    const accessToken = this.jwtService.sign(payload as any, {
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload as any, {
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d') as any,
    });

    // Store refresh token hash
    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.userModel.findById(payload.sub);

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRefreshValid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isRefreshValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload: JwtPayload = {
        sub: user._id.toString(),
        email: user.email,
        username: user.username,
      };

      const newAccessToken = this.jwtService.sign(newPayload as any, {
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m') as any,
      });

      const newRefreshToken = this.jwtService.sign(newPayload as any, {
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d') as any,
      });

      user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
      await user.save();

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if email exists
      return { message: 'If the email exists, a password reset link has been sent.' };
    }

    const resetToken = uuidv4();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    await this.mailService.sendPasswordResetEmail(user.email, resetToken);

    return { message: 'If the email exists, a password reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetPasswordToken = null as any;
    user.resetPasswordExpires = null as any;
    user.refreshToken = null as any; // Invalidate all sessions
    await user.save();

    return { message: 'Password reset successful. Please log in with your new password.' };
  }

  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }
}
