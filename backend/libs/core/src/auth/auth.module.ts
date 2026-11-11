import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseModule } from '../storage/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

