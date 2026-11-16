import { TriggerDispatcher } from './ingestion/trigger.dispatcher';
import { CredentialResolver } from './connections/credential.resolver';
import { ConnectionStatus } from './common/interfaces';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExecutorService } from './executor/executor.service';
import { EngineService } from './engine/engine.service';

describe('Phase 7 — Reliability, Resilience & Edge-Case Hardening', () => {
  describe('1. Webhook Deduplication & Idempotency', () => {
    let triggerDispatcher: TriggerDispatcher;
    let mockPrisma: any;
    let mockWorkflowService: any;
    let mockWorkflowRunRepo: any;
    let mockQueueService: any;

    beforeEach(() => {
      mockPrisma = {
        triggerEvent: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      };

      mockWorkflowService = {
        findActiveWorkflowsByTrigger: jest.fn().mockResolvedValue([
          { id: 'wf-1', name: 'Slack Alert', version: 1 },
        ]),
      };

      mockWorkflowRunRepo = {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      };

      mockQueueService = {
        addWorkflowJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      };

      triggerDispatcher = new TriggerDispatcher(
        mockPrisma,
        mockWorkflowService,
        mockWorkflowRunRepo,
        mockQueueService,
      );
    });

    it('should process a first-time webhook event and queue workflow', async () => {
      mockPrisma.triggerEvent.findUnique.mockResolvedValue(null);

      const event = {
        provider: 'github',
        triggerKey: 'issue.created',
        externalEventId: 'delivery-uuid-001',
        connectionId: 'conn-1',
        externalAccountId: 'octocat/Hello-World',
        eventTimestamp: new Date(),
        payload: { title: 'First time issue' },
      };

      const result = await triggerDispatcher.dispatch(event);

      expect(result.processed).toBe(true);
      expect(result.duplicate).toBeUndefined();
      expect(result.matchedWorkflows).toBe(1);
      expect(mockQueueService.addWorkflowJob).toHaveBeenCalledTimes(1);
    });

    it('should detect duplicate webhook deliveries and prevent duplicate workflow runs', async () => {
      // Simulate that this event was already ingested
      mockPrisma.triggerEvent.findUnique.mockResolvedValue({
        id: 'te-existing',
        externalEventId: 'delivery-uuid-001',
      });

      const duplicateEvent = {
        provider: 'github',
        triggerKey: 'issue.created',
        externalEventId: 'delivery-uuid-001',
        connectionId: 'conn-1',
        externalAccountId: 'octocat/Hello-World',
        eventTimestamp: new Date(),
        payload: { title: 'First time issue (Retry from GitHub)' },
      };

      const result = await triggerDispatcher.dispatch(duplicateEvent);

      expect(result.processed).toBe(false);
      expect(result.duplicate).toBe(true);
      expect(result.matchedWorkflows).toBe(0);
      expect(mockQueueService.addWorkflowJob).not.toHaveBeenCalled();
      expect(mockWorkflowRunRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('2. Security & Tenant Isolation', () => {
    let credentialResolver: CredentialResolver;
    let mockConnectionService: any;
    let mockEncryptionService: any;
    let mockAdapterRegistry: any;

    beforeEach(() => {
      mockConnectionService = {
        getRawConnection: jest.fn(),
        updateTokens: jest.fn(),
      };
      mockEncryptionService = {
        decrypt: jest.fn(),
      };
      mockAdapterRegistry = {
        get: jest.fn(),
      };

      credentialResolver = new CredentialResolver(
        mockConnectionService,
        mockEncryptionService,
        mockAdapterRegistry,
      );
    });

    it('should reject execution if a user attempts to use another user connection', async () => {
      mockConnectionService.getRawConnection.mockResolvedValue({
        id: 'conn-bob',
        userId: 'user-bob',
        provider: 'slack',
        status: ConnectionStatus.ACTIVE,
        encryptedCredentials: 'enc-blob',
      });

      // User Alice tries to use User Bob's connection
      await expect(credentialResolver.resolve('conn-bob', 'user-alice')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should block execution if the connection status is REVOKED', async () => {
      mockConnectionService.getRawConnection.mockResolvedValue({
        id: 'conn-alice',
        userId: 'user-alice',
        provider: 'slack',
        status: ConnectionStatus.REVOKED,
        encryptedCredentials: 'enc-blob',
      });

      await expect(credentialResolver.resolve('conn-alice', 'user-alice')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should proactively refresh expired OAuth access tokens if refresh token is available', async () => {
      mockConnectionService.getRawConnection.mockResolvedValue({
        id: 'conn-slack-1',
        userId: 'user-alice',
        provider: 'slack',
        status: ConnectionStatus.ACTIVE,
        encryptedCredentials: 'enc-blob',
      });

      // Token expired 10 minutes ago
      mockEncryptionService.decrypt.mockReturnValue({
        accessToken: 'expired-token-xyz',
        refreshToken: 'valid-refresh-token-abc',
        expiresAt: new Date(Date.now() - 600000),
      });

      const mockSlackAdapter = {
        refreshAccessToken: jest.fn().mockResolvedValue({
          accessToken: 'fresh-new-token-999',
          refreshToken: 'fresh-refresh-token-888',
          expiresAt: new Date(Date.now() + 3600000),
        }),
      };
      mockAdapterRegistry.get.mockReturnValue(mockSlackAdapter);

      const resolved = await credentialResolver.resolve('conn-slack-1', 'user-alice');

      expect(resolved.accessToken).toBe('fresh-new-token-999');
      expect(mockSlackAdapter.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token-abc');
      expect(mockConnectionService.updateTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'conn-slack-1',
          tokens: expect.objectContaining({ accessToken: 'fresh-new-token-999' }),
        }),
      );
    });
  });

  describe('3. Rate Limiting (HTTP 429) & Fast-Fail on Non-Retryable Errors', () => {
    let executorService: ExecutorService;
    let mockStepRunRepo: any;
    let mockWorkflowRunRepo: any;
    let mockQueueService: any;
    let mockActionDispatcher: any;

    beforeEach(() => {
      mockStepRunRepo = {
        create: jest.fn().mockResolvedValue({}),
        incrementAttempts: jest.fn().mockResolvedValue({}),
        complete: jest.fn().mockResolvedValue({}),
        markFailed: jest.fn().mockResolvedValue({}),
      };
      mockWorkflowRunRepo = {
        updateCurrentStep: jest.fn().mockResolvedValue({}),
        updateContext: jest.fn().mockResolvedValue({}),
      };
      mockQueueService = {
        addWorkflowJob: jest.fn().mockResolvedValue({}),
      };
      mockActionDispatcher = {
        dispatch: jest.fn(),
      };

      executorService = new ExecutorService(
        mockStepRunRepo,
        mockWorkflowRunRepo,
        mockQueueService,
        mockActionDispatcher,
      );
    });

    it('should retry on rate limits and succeed when third attempt succeeds', async () => {
      // Attempt 1: 429 Rate limited
      // Attempt 2: 429 Rate limited
      // Attempt 3: Success
      mockActionDispatcher.dispatch
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests', retryable: true },
          durationMs: 50,
        })
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests', retryable: true },
          durationMs: 40,
        })
        .mockResolvedValueOnce({
          success: true,
          output: { id: 'task-100' },
          durationMs: 30,
        });

      const workflow = {
        name: 'Retryable Workflow',
        steps: [
          {
            id: 'step_1',
            provider: 'todoist',
            operationKey: 'task.create',
            connectionId: 'c1',
            inputMapping: { content: 'Task' },
            retry: { maxAttempts: 3, backoffMs: 1 }, // Minimal backoff for unit test
          },
        ],
      };

      await executorService.runWorkflow(workflow, {}, 'run-1', 0);

      expect(mockActionDispatcher.dispatch).toHaveBeenCalledTimes(3);
      expect(mockStepRunRepo.complete).toHaveBeenCalledWith('run-1', 'step_1', { id: 'task-100' }, 30);
    });

    it('should fail immediately without wasting retry attempts on non-retryable 401 errors', async () => {
      mockActionDispatcher.dispatch.mockResolvedValueOnce({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API token', retryable: false },
        durationMs: 20,
      });

      const workflow = {
        name: 'Non-retryable Workflow',
        steps: [
          {
            id: 'step_1',
            provider: 'slack',
            operationKey: 'message.send',
            connectionId: 'c1',
            inputMapping: { text: 'hi', channel: 'c' },
            retry: { maxAttempts: 5, backoffMs: 1 },
          },
        ],
      };

      await expect(executorService.runWorkflow(workflow, {}, 'run-1', 0)).rejects.toThrow('Invalid API token');

      // Crucial: Only called 1 time! Did not make 5 pointless requests with an invalid token
      expect(mockActionDispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(mockStepRunRepo.markFailed).toHaveBeenCalledWith('run-1', 'step_1', 'Invalid API token', 'UNAUTHORIZED');
    });
  });

  describe('4. Failed Execution Recovery (Retry from Failed Step)', () => {
    let engineService: EngineService;
    let mockWorkflowService: any;
    let mockExecutorService: any;
    let mockWorkflowRunRepo: any;
    let mockQueueService: any;
    let mockStepRunRepo: any;

    beforeEach(() => {
      mockWorkflowService = {
        getStepIndex: jest.fn().mockReturnValue(2), // Step 2 was the failed step
      };
      mockExecutorService = {};
      mockWorkflowRunRepo = {
        findById: jest.fn().mockResolvedValue({
          id: 'run-failed-123',
          workflowName: 'Multi-Step Deploy Pipeline',
          triggerPayload: { ref: 'main' },
        }),
        updateCurrentStep: jest.fn().mockResolvedValue({}),
      };
      mockQueueService = {
        addWorkflowJob: jest.fn().mockResolvedValue({ id: 'job-retry-1' }),
      };
      mockStepRunRepo = {
        getFailedStep: jest.fn().mockResolvedValue({
          stepId: 'step_notify_discord',
        }),
      };

      engineService = new EngineService(
        mockWorkflowService,
        mockExecutorService,
        mockWorkflowRunRepo,
        mockQueueService,
        mockStepRunRepo,
      );
    });

    it('should resume execution from the exact step that failed without re-running earlier steps', async () => {
      const response = await engineService.retryWorkflow('run-failed-123');

      expect(response.message).toBe('Workflow retry triggered');
      expect(response.resumedFromStep).toBe('step_notify_discord');

      expect(mockWorkflowService.getStepIndex).toHaveBeenCalledWith(
        'Multi-Step Deploy Pipeline',
        'step_notify_discord',
      );

      // Verifies the BullMQ job is re-enqueued with stepIndex: 2
      expect(mockQueueService.addWorkflowJob).toHaveBeenCalledWith({
        workflowName: 'Multi-Step Deploy Pipeline',
        payload: { ref: 'main' },
        runId: 'run-failed-123',
        stepIndex: 2,
      });

      expect(mockWorkflowRunRepo.updateCurrentStep).toHaveBeenCalledWith('run-failed-123', 2);
    });
  });
});
