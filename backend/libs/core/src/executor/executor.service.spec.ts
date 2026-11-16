import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorService } from './executor.service';
import { StepRunRepository } from '../storage/step-run.repository';
import { WorkflowRunRepository } from '../storage/workflow-run.repository';
import { QueueService } from '../queue/queue.service';
import { ActionDispatcher } from './action.dispatcher';

describe('ExecutorService', () => {
  let service: ExecutorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutorService,
        { provide: StepRunRepository, useValue: {} },
        { provide: WorkflowRunRepository, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: ActionDispatcher, useValue: {} },
      ],
    }).compile();

    service = module.get<ExecutorService>(ExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
