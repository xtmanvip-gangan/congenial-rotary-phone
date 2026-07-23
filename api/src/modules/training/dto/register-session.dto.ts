import { ArrayMinSize, IsArray, IsString } from 'class-validator'

export class RegisterSessionDto {
  @IsString()
  sessionId!: string
}

export class StaffRegisterSessionDto extends RegisterSessionDto {
  @IsString()
  anchorProfileId!: string
}

export class BulkOperatorRegisterDto extends RegisterSessionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  anchorProfileIds!: string[]
}
