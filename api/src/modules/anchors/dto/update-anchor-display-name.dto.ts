import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class UpdateAnchorDisplayNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  anchorDisplayName!: string
}
