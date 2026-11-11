import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FlowForageModule } from 'eventbridge/core';

@Module({
  imports: [FlowForageModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
