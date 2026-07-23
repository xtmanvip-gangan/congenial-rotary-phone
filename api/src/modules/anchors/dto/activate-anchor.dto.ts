import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

export class ActivateAnchorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  anchorDisplayName!: string

  @IsUUID()
  operatorId!: string
}
