import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
  getSummary() {
    return {
      name: '礼物收集活动管理系统 API',
      status: 'bootstrapped',
      modules: ['auth', 'activities', 'operators', 'submissions', 'notifications'],
    }
  }
}
