import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

export class PasswordLoginDto {
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
