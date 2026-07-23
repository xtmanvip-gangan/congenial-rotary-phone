import {
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
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

  @IsUUID()
  operatorId!: string

  @IsDateString()
  membershipCompletedAt!: string
}
