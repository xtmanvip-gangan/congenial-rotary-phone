import { ArrayMinSize, IsArray, IsUUID } from 'class-validator'

export class AdminTransferAnchorsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  anchorIds!: string[]

  @IsUUID()
  targetOperatorId!: string
}
