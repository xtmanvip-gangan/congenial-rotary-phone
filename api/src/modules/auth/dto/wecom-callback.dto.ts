import { IsOptional, IsString, MinLength } from 'class-validator'

export class WecomCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsOptional()
  @IsString()
  state?: string
}
