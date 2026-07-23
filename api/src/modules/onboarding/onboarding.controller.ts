import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { CompleteFirstLiveDto } from './dto/complete-first-live.dto.js'
import { CompleteFirstLiveReviewDto } from './dto/complete-first-live-review.dto.js'
import { UpdateMilestoneDto } from './dto/update-milestone.dto.js'
import { OnboardingService } from './onboarding.service.js'

@Controller('operators/me/anchors/:anchorId/onboarding')
export class OnboardingController {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Get()
  getProgress(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
  ) {
    return this.onboardingService.getProgress(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
    )
  }

  @Patch(':milestone')
  completeMilestone(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
    @Param('milestone') milestone: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.onboardingService.completeMilestone(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
      milestone,
      dto,
    )
  }

  @Post('first-live')
  completeFirstLive(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
    @Body() dto: CompleteFirstLiveDto,
  ) {
    return this.onboardingService.completeFirstLive(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
      dto,
    )
  }

  @Post('first-live-review')
  completeFirstLiveReview(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
    @Body() dto: CompleteFirstLiveReviewDto,
  ) {
    return this.onboardingService.completeFirstLiveReview(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
      dto,
    )
  }
}
