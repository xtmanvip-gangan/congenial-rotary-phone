import { StaffRole } from '@prisma/client'
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator'

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  wecomUserId!: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(StaffRole, { each: true })
  roles!: StaffRole[]
}
