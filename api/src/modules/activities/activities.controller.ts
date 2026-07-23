import { Body, Controller, Get, Headers, Param, Patch, Post, Put } from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { ActivitiesService } from './activities.service.js'
import { CreateActivityDto } from './dto/create-activity.dto.js'
import { SaveActivityConfigDto } from './dto/save-activity-config.dto.js'
import { UpdateActivityDto } from './dto/update-activity.dto.js'
import { UpdateActivityStatusDto } from './dto/update-activity-status.dto.js'

@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly authService: AuthService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  @Get('types')
  async listActivityTypes(@Headers('authorization') authorization?: string) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.listActivityTypes(currentUser)
  }

  @Get()
  async listActivities(@Headers('authorization') authorization?: string) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.listActivities(currentUser)
  }

  @Get(':activityId/config')
  async getActivityConfig(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.getActivityConfig(currentUser, activityId)
  }

  @Post()
  async createActivity(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateActivityDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.createActivity(currentUser, dto)
  }

  @Put(':activityId')
  async updateActivity(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.updateActivity(currentUser, activityId, dto)
  }

  @Patch(':activityId/status')
  async updateActivityStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityStatusDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.updateActivityStatus(currentUser, activityId, dto.status)
  }

  @Put(':activityId/config')
  async saveActivityConfig(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
    @Body() dto: SaveActivityConfigDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.saveActivityConfig(currentUser, activityId, dto)
  }
}
