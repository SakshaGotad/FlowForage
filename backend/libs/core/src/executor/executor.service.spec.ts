import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from './executor.service';
import { StepRunRepository } from '../storage/step-run.repository';
import { QueueService } from '../queue/queue.service';

describe('ExecutorService', () => {
  let service: ExecutorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutorService,
        { provide: StepRunRepository, useValue: {} },
        { provide: QueueService, useValue: {} },
      ],
    }).compile();

    service = module.get<ExecutorService>(ExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
