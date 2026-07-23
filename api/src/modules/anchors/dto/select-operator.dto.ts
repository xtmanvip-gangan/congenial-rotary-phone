import { IsUUID } from 'class-validator'

export class SelectOperatorDto {
  @IsUUID()
  operatorId!: string
}
