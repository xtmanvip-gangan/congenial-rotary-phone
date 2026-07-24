import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module.js'
import { AuthModule } from '../auth/auth.module.js'
import {
  AnchorOnboardingController,
  OnboardingController,
} from './onboarding.controller.js'
import { OnboardingService } from './onboarding.service.js'

@Module({
  imports: [AccessModule, AuthModule],
  controllers: [OnboardingController, AnchorOnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
