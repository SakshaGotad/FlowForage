import * as crypto from 'crypto';
import { IntegrationRegistry } from './registry/integration.registry';
import { OperationRegistry } from './registry/operation.registry';
import { AdapterRegistry } from './providers/adapter.registry';
import { GitHubAdapter } from './providers/github/github.adapter';
import { TodoistAdapter } from './providers/todoist/todoist.adapter';
import { FieldMappingResolver } from './executor/field-mapping.resolver';
import { ActionDispatcher } from './executor/action.dispatcher';
import { EventNormalizer } from './ingestion/event.normalizer';
import { TriggerDispatcher } from './ingestion/trigger.dispatcher';
import { WebhookController } from './ingestion/webhook.controller';
import { ExecutorService } from './executor/executor.service';
import { WorkflowStatus } from './common/interfaces';

describe('Phase 5 — Vertical Slice: GitHub Issue Created -> Todoist Create Task', () => {
  let integrationRegistry: IntegrationRegistry;
  let operationRegistry: OperationRegistry;
  let adapterRegistry: AdapterRegistry;
  let githubAdapter: GitHubAdapter;
  let todoistAdapter: TodoistAdapter;
  let fieldMappingResolver: FieldMappingResolver;
  let credentialResolver: any;
  let actionDispatcher: ActionDispatcher;
  let eventNormalizer: EventNormalizer;
  let triggerDispatcher: TriggerDispatcher;
  let webhookController: WebhookController;
  let executorService: ExecutorService;

  // Mock dependencies
  let mockPrisma: any;
  let mockWorkflowService: any;
  let mockWorkflowRunRepo: any;
  let mockStepRunRepo: any;
  let mockQueueService: any;
  let mockConnectionService: any;

  const WEBHOOK_SECRET = 'test-github-secret-12345';
  const USER_ID = 'user-alice-123';
  const TODOIST_CONNECTION_ID = 'conn-todoist-999';

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;

    // 1. Initialize Registries
    integrationRegistry = new IntegrationRegistry();
    operationRegistry = new OperationRegistry();
    adapterRegistry = new AdapterRegistry();

    // 2. Initialize Adapters
    githubAdapter = new GitHubAdapter(
      integrationRegistry,
      operationRegistry,
      adapterRegistry,
    );
    todoistAdapter = new TodoistAdapter(
      integrationRegistry,
      operationRegistry,
      adapterRegistry,
    );

    // Run module init hooks to register definitions
    githubAdapter.onModuleInit();
    todoistAdapter.onModuleInit();

    // 3. Mock Repositories & Services
    mockPrisma = {
      triggerEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'te-1' }),
        update: jest.fn().mockResolvedValue({ id: 'te-1', processed: true }),
      },
    };

    mockWorkflowService = {
      findActiveWorkflowsByTrigger: jest.fn(),
    };

    mockWorkflowRunRepo = {
      create: jest.fn().mockResolvedValue({ id: 'run-uuid-123' }),
      updateCurrentStep: jest.fn().mockResolvedValue({}),
      updateContext: jest.fn().mockResolvedValue({}),
      complete: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
      findById: jest.fn().mockResolvedValue(null),
    };

    mockStepRunRepo = {
      create: jest.fn().mockResolvedValue({ id: 'step-run-1' }),
      incrementAttempts: jest.fn().mockResolvedValue({}),
      complete: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
    };

    mockQueueService = {
      addWorkflowJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockConnectionService = {
      findByExternalAccount: jest.fn().mockResolvedValue({
        id: 'conn-github-111',
        userId: USER_ID,
        provider: 'github',
      }),
    };

    // 4. Ingestion Services
    eventNormalizer = new EventNormalizer();
    triggerDispatcher = new TriggerDispatcher(
      mockPrisma,
      mockWorkflowService,
      mockWorkflowRunRepo,
      mockQueueService,
    );
    webhookController = new WebhookController(
      adapterRegistry,
      mockConnectionService,
      eventNormalizer,
      triggerDispatcher,
    );

    // 5. Execution Services
    fieldMappingResolver = new FieldMappingResolver();
    credentialResolver = {
      resolve: jest.fn().mockResolvedValue({
        accessToken: 'todoist_oauth_token_secret_xyz',
        metadata: {},
      }),
    };

    actionDispatcher = new ActionDispatcher(
      operationRegistry,
      adapterRegistry,
      credentialResolver,
      fieldMappingResolver,
    );

    executorService = new ExecutorService(
      mockStepRunRepo,
      mockWorkflowRunRepo,
      mockQueueService,
      actionDispatcher,
    );
  });

  describe('1. Registry Verification', () => {
    it('should have registered GitHub integration and issue.created trigger', () => {
      expect(integrationRegistry.has('github')).toBe(true);
      const trigger = operationRegistry.getTrigger('github', 'issue.created');
      expect(trigger).toBeDefined();
      expect(trigger?.displayName).toBe('Issue Created');
      expect(trigger?.outputSchema.properties).toHaveProperty('title');
      expect(trigger?.outputSchema.properties).toHaveProperty('number');
    });

    it('should have registered Todoist integration and task.create action', () => {
      expect(integrationRegistry.has('todoist')).toBe(true);
      const action = operationRegistry.getAction('todoist', 'task.create');
      expect(action).toBeDefined();
      expect(action?.displayName).toBe('Create Task');
      expect(action?.inputSchema.properties).toHaveProperty('content');
    });
  });

  describe('2. GitHub Webhook Signature & Event Normalization', () => {
    it('should verify authentic HMAC-SHA256 signature and reject forged signatures', () => {
      const payloadString = JSON.stringify({ action: 'opened', issue: { number: 1 } });
      const rawBody = Buffer.from(payloadString);

      // Generate valid signature
      const validHmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
      const validHeaders = { 'x-hub-signature-256': `sha256=${validHmac}` };

      expect(githubAdapter.verifyWebhookSignature(validHeaders, rawBody, WEBHOOK_SECRET)).toBe(true);

      // Test invalid signature
      const invalidHeaders = { 'x-hub-signature-256': 'sha256=invalidhash123' };
      expect(githubAdapter.verifyWebhookSignature(invalidHeaders, rawBody, WEBHOOK_SECRET)).toBe(false);
    });

    it('should parse GitHub issues.opened payload into normalized format', () => {
      const gitHubPayload = {
        action: 'opened',
        issue: {
          id: 1001,
          number: 42,
          title: 'Login button broken on mobile',
          body: 'Users cannot log in on iOS Safari',
          html_url: 'https://github.com/octocat/Hello-World/issues/42',
          state: 'open',
          user: { login: 'octocat' },
          created_at: '2026-11-12T10:00:00Z',
        },
        repository: {
          full_name: 'octocat/Hello-World',
          owner: { login: 'octocat' },
        },
      };

      const headers = {
        'x-github-event': 'issues',
        'x-github-delivery': 'delivery-uuid-999',
      };

      const parsed = githubAdapter.parseWebhookEvent(headers, gitHubPayload);
      expect(parsed).not.toBeNull();
      expect(parsed?.triggerKey).toBe('issue.created');
      expect(parsed?.payload.number).toBe(42);
      expect(parsed?.payload.title).toBe('Login button broken on mobile');
      expect(parsed?.payload.author).toBe('octocat');

      const normalized = eventNormalizer.normalize('github', parsed!, 'conn-github-111');
      expect(normalized.provider).toBe('github');
      expect(normalized.triggerKey).toBe('issue.created');
      expect(normalized.externalEventId).toBe('delivery-uuid-999');
      expect(normalized.payload.title).toBe('Login button broken on mobile');
    });
  });

  describe('3. End-to-End Execution Flow (GitHub Issue -> Todoist Task)', () => {
    it('should process webhook, match workflow, enqueue job, and dispatch Todoist action with resolved field mappings', async () => {
      // 1. Setup Active Workflow Definition
      const activeWorkflow = {
        id: 'wf-github-to-todoist',
        userId: USER_ID,
        name: 'Sync GitHub Issues to Todoist',
        status: WorkflowStatus.ACTIVE,
        version: 1,
        trigger: {
          provider: 'github',
          operationKey: 'issue.created',
          config: { repository: 'octocat/Hello-World' },
        },
        steps: [
          {
            id: 'create_todoist_task',
            provider: 'todoist',
            operationKey: 'task.create',
            connectionId: TODOIST_CONNECTION_ID,
            inputMapping: {
              content: 'Fix #{{trigger.output.number}}: {{trigger.output.title}}',
              description: 'Opened by {{trigger.output.author}} on GitHub: {{trigger.output.html_url}}',
              due_string: 'today',
            },
          },
        ],
      };

      mockWorkflowService.findActiveWorkflowsByTrigger.mockResolvedValue([activeWorkflow]);

      // 2. Incoming GitHub Webhook HTTP Request
      const webhookPayload = {
        action: 'opened',
        issue: {
          id: 555,
          number: 77,
          title: 'Database connection timeout under load',
          body: 'Postgres connection pool exhausted during peak hours',
          html_url: 'https://github.com/octocat/Hello-World/issues/77',
          user: { login: 'octocat' },
          created_at: '2026-11-12T12:00:00Z',
        },
        repository: {
          full_name: 'octocat/Hello-World',
        },
      };

      const rawBody = Buffer.from(JSON.stringify(webhookPayload));
      const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
      const headers = {
        'x-hub-signature-256': `sha256=${hmac}`,
        'x-github-event': 'issues',
        'x-github-delivery': 'delivery-event-1234',
      };

      // Mock Request object with rawBody
      const mockReq: any = { rawBody };

      // 3. Webhook arrives at WebhookController
      const webhookResponse = await webhookController.handleWebhook(
        'github',
        headers,
        mockReq,
        webhookPayload,
      );

      expect(webhookResponse.success).toBe(true);
      expect(webhookResponse.matchedWorkflows).toBe(1);
      expect(webhookResponse.runIds).toContain('run-uuid-123');

      // Verify WorkflowRun was recorded in DB and queued in BullMQ
      expect(mockWorkflowRunRepo.create).toHaveBeenCalledWith({
        workflowId: 'wf-github-to-todoist',
        workflowName: 'Sync GitHub Issues to Todoist',
        payload: expect.objectContaining({ title: 'Database connection timeout under load' }),
        version: 1,
      });

      expect(mockQueueService.addWorkflowJob).toHaveBeenCalledWith({
        workflowName: 'Sync GitHub Issues to Todoist',
        payload: expect.objectContaining({ number: 77 }),
        runId: 'run-uuid-123',
        stepIndex: 0,
      });

      // 4. Simulate BullMQ Worker picking up the job and calling ExecutorService
      const globalFetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'task-todoist-8888',
          content: 'Fix #77: Database connection timeout under load',
          description: 'Opened by octocat on GitHub: https://github.com/octocat/Hello-World/issues/77',
          url: 'https://todoist.com/showTask?id=task-todoist-8888',
          is_completed: false,
          created_at: '2026-11-12T12:01:00Z',
        }),
      } as any);

      // Execute Workflow with the enqueued payload from trigger dispatcher
      const enqueuedPayload = mockQueueService.addWorkflowJob.mock.calls[0][0].payload;

      await executorService.runWorkflow(
        activeWorkflow,
        enqueuedPayload,
        'run-uuid-123',
        0,
      );

      // 5. Verify Field Mapping & Todoist Action Call
      expect(credentialResolver.resolve).toHaveBeenCalledWith(
        TODOIST_CONNECTION_ID,
        USER_ID,
      );

      expect(globalFetchSpy).toHaveBeenCalledWith(
        'https://api.todoist.com/rest/v2/tasks',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer todoist_oauth_token_secret_xyz',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            content: 'Fix #77: Database connection timeout under load',
            description: 'Opened by octocat on GitHub: https://github.com/octocat/Hello-World/issues/77',
            due_string: 'today',
          }),
        }),
      );

      // Verify StepRun completed in DB
      expect(mockStepRunRepo.complete).toHaveBeenCalledWith(
        'run-uuid-123',
        'create_todoist_task',
        expect.objectContaining({ id: 'task-todoist-8888' }),
        expect.any(Number),
      );

      globalFetchSpy.mockRestore();
    });
  });
});
