import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../common/pipes/object-id-validation.pipe';

@Controller('posts')
@UseGuards(AuthGuard('jwt'))
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  async getFeed(
    @CurrentUser('sub') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.postsService.getFeed(userId, cursor, limit || 20);
  }

  @Post()
  async createPost(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.create(userId, dto);
  }

  @Get('user/:userId')
  async getUserPosts(
    @Param('userId', ParseObjectIdPipe) userId: string,
    @CurrentUser('sub') currentUserId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.postsService.getUserPosts(userId, currentUserId, cursor, limit || 20);
  }

  @Get(':id')
  async getPost(
    @Param('id', ParseObjectIdPipe) postId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.postsService.getById(postId, userId);
  }

  @Delete(':id')
  async deletePost(
    @Param('id', ParseObjectIdPipe) postId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.postsService.deletePost(postId, userId);
  }

  @Patch(':id')
  async updatePost(
    @Param('id', ParseObjectIdPipe) postId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.updatePost(postId, userId, dto);
  }

  @Post(':id/like')
  async toggleLike(
    @Param('id', ParseObjectIdPipe) postId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.postsService.toggleLike(postId, userId);
  }

  @Post(':id/comment')
  async addComment(
    @Param('id', ParseObjectIdPipe) postId: string,
    @CurrentUser('sub') userId: string,
    @Body('content') content: string,
  ) {
    return this.postsService.addComment(postId, userId, content);
  }

  @Post(':id/share')
  async sharePost(
    @Param('id', ParseObjectIdPipe) postId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.postsService.sharePost(postId, userId);
  }
}
