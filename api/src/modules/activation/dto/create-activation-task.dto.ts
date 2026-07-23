import {
  IsDateString,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator'

export class CreateActivationTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  expectedWecomUserId!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  wecomDisplayName!: string

  @IsDateString()
  membershipCompletedAt!: string

  @IsDateString()
  deviceReadyAt!: string
}
