import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      close: jest.fn(),
    })),
  };
});

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';

    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueService],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
