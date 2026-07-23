import { IsUUID } from 'class-validator'

export class ReassignActivationOperatorDto {
  @IsUUID()
  operatorId!: string
}
