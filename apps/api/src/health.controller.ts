import { Controller, Get } from '@nestjs/common';
import { Public } from './user-auth/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}
