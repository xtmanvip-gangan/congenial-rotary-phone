import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateGrantStatusDto {
  @IsString()
  @IsIn(['granted'])
  status!: 'granted'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string

  @IsOptional()
  @IsString()
  proofAttachmentUrl?: string
}
