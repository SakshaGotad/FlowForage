import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../storage/prisma.service';
import { OperationRegistry } from '../registry/operation.registry';
import { ConnectionService } from '../connections/connection.service';

describe('WorkflowService', () => {
  let service: WorkflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: {} },
        { provide: OperationRegistry, useValue: {} },
        { provide: ConnectionService, useValue: {} },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

