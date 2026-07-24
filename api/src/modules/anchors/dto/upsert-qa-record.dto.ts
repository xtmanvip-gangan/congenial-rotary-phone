import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateQaRecordDto {
  @IsDateString()
  qaAt!: string

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question!: string

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  reply!: string
}

export class UpdateQaFollowUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  resultFollowUp!: string
}

export class UpdateQaRecordDto {
  @IsOptional()
  @IsDateString()
  qaAt?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  reply?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resultFollowUp?: string | null
}
