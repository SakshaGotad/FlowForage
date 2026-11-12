import { Test, TestingModule } from '@nestjs/testing';
import { EngineService } from './engine.service';
import { WorkflowService } from '../workflow/workflow.service';
import { ExecutorService } from '../executor/executor.service';
import { WorkflowRunRepository } from '../storage/workflow-run.repository';
import { QueueService } from '../queue/queue.service';
import { StepRunRepository } from '../storage/step-run.repository';

describe('EngineService', () => {
  let service: EngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EngineService,
        { provide: WorkflowService, useValue: {} },
        { provide: ExecutorService, useValue: {} },
        { provide: WorkflowRunRepository, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: StepRunRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<EngineService>(EngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
