import { IsOptional, IsString, IsEnum, MaxLength } from 'class-validator';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsEnum(['public', 'friends', 'private'])
  visibility?: string;
}
