import { IsOptional, IsString, IsArray, IsEnum, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @IsOptional()
  @IsEnum(['public', 'friends', 'private'])
  visibility?: string;
}
