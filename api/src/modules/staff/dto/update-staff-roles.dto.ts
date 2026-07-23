import { StaffRole } from '@prisma/client'
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
} from 'class-validator'

export class UpdateStaffRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(StaffRole, { each: true })
  roles!: StaffRole[]
}
