import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateOperatorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName!: string

  @IsString()
  @IsOptional()
  @MaxLength(64)
  wecomUserId?: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(64)
  password!: string
}
