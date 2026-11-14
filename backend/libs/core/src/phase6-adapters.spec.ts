import * as crypto from 'crypto';
import { IntegrationRegistry } from './registry/integration.registry';
import { OperationRegistry } from './registry/operation.registry';
import { AdapterRegistry } from './providers/adapter.registry';
import { GitHubAdapter } from './providers/github/github.adapter';
import { TodoistAdapter } from './providers/todoist/todoist.adapter';
import { SlackAdapter } from './providers/slack/slack.adapter';
import { LinearAdapter } from './providers/linear/linear.adapter';
import { DiscordAdapter } from './providers/discord/discord.adapter';
import { NotionAdapter } from './providers/notion/notion.adapter';

describe('Phase 6 — All 6 Integrations Verification', () => {
  let integrationRegistry: IntegrationRegistry;
  let operationRegistry: OperationRegistry;
  let adapterRegistry: AdapterRegistry;

  let github: GitHubAdapter;
  let todoist: TodoistAdapter;
  let slack: SlackAdapter;
  let linear: LinearAdapter;
  let discord: DiscordAdapter;
  let notion: NotionAdapter;

  beforeEach(() => {
    integrationRegistry = new IntegrationRegistry();
    operationRegistry = new OperationRegistry();
    adapterRegistry = new AdapterRegistry();

    github = new GitHubAdapter(integrationRegistry, operationRegistry, adapterRegistry);
    todoist = new TodoistAdapter(integrationRegistry, operationRegistry, adapterRegistry);
    slack = new SlackAdapter(integrationRegistry, operationRegistry, adapterRegistry);
    linear = new LinearAdapter(integrationRegistry, operationRegistry, adapterRegistry);
    discord = new DiscordAdapter(integrationRegistry, operationRegistry, adapterRegistry);
    notion = new NotionAdapter(integrationRegistry, operationRegistry, adapterRegistry);

    // Run module init hooks
    github.onModuleInit();
    todoist.onModuleInit();
    slack.onModuleInit();
    linear.onModuleInit();
    discord.onModuleInit();
    notion.onModuleInit();
  });

  describe('1. Global Registry Verification for all 6 Providers', () => {
    it('should have all 6 integrations registered in the catalog', () => {
      const allIntegrations = integrationRegistry.getAll().map((i) => i.key);
      expect(allIntegrations).toContain('github');
      expect(allIntegrations).toContain('todoist');
      expect(allIntegrations).toContain('slack');
      expect(allIntegrations).toContain('linear');
      expect(allIntegrations).toContain('discord');
      expect(allIntegrations).toContain('notion');
      expect(allIntegrations.length).toBe(6);
    });

    it('should have registered triggers and actions for all providers', () => {
      expect(operationRegistry.getTrigger('github', 'issue.created')).toBeDefined();
      expect(operationRegistry.getAction('github', 'issue.create')).toBeDefined();

      expect(operationRegistry.getAction('todoist', 'task.create')).toBeDefined();

      expect(operationRegistry.getTrigger('slack', 'message.received')).toBeDefined();
      expect(operationRegistry.getAction('slack', 'message.send')).toBeDefined();

      expect(operationRegistry.getTrigger('linear', 'issue.created')).toBeDefined();
      expect(operationRegistry.getAction('linear', 'issue.create')).toBeDefined();

      expect(operationRegistry.getTrigger('discord', 'message.received')).toBeDefined();
      expect(operationRegistry.getAction('discord', 'message.send')).toBeDefined();

      expect(operationRegistry.getTrigger('notion', 'page.created')).toBeDefined();
      expect(operationRegistry.getAction('notion', 'page.create')).toBeDefined();
    });
  });

  describe('2. Slack Adapter', () => {
    const SLACK_SECRET = 'slack-signing-secret-xyz';

    it('should verify Slack HMAC-SHA256 signature with timestamp replay protection', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const rawBody = Buffer.from(JSON.stringify({ event: { text: 'hello' } }));
      const sigBase = `v0:${timestamp}:${rawBody.toString('utf8')}`;
      const hash = crypto.createHmac('sha256', SLACK_SECRET).update(sigBase).digest('hex');

      const headers = {
        'x-slack-signature': `v0=${hash}`,
        'x-slack-request-timestamp': timestamp,
      };

      expect(slack.verifyWebhookSignature(headers, rawBody, SLACK_SECRET)).toBe(true);

      // Replay attack: timestamp older than 5 minutes
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
      const oldHeaders = {
        'x-slack-signature': `v0=${hash}`,
        'x-slack-request-timestamp': oldTimestamp,
      };
      expect(slack.verifyWebhookSignature(oldHeaders, rawBody, SLACK_SECRET)).toBe(false);
    });

    it('should execute message.send via Slack Web API', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        json: async () => ({
          ok: true,
          channel: 'C12345',
          ts: '1700000000.000100',
          message: { ts: '1700000000.000100' },
        }),
      } as any);

      const result = await slack.executeAction(
        'message.send',
        { accessToken: 'xoxb-test-token', metadata: {} },
        { channel: 'C12345', text: 'Deployment successful!' },
      );

      expect(result.success).toBe(true);
      expect(result.output?.channel).toBe('C12345');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ channel: 'C12345', text: 'Deployment successful!' }),
        }),
      );

      fetchSpy.mockRestore();
    });
  });

  describe('3. Linear Adapter', () => {
    const LINEAR_SECRET = 'linear-webhook-secret-456';

    it('should verify Linear webhook signature', () => {
      const rawBody = Buffer.from(JSON.stringify({ action: 'create', type: 'Issue' }));
      const hash = crypto.createHmac('sha256', LINEAR_SECRET).update(rawBody).digest('hex');

      const headers = { 'linear-signature': hash };
      expect(linear.verifyWebhookSignature(headers, rawBody, LINEAR_SECRET)).toBe(true);
    });

    it('should execute issue.create via Linear GraphQL API', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        json: async () => ({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'linear-issue-uuid',
                identifier: 'ENG-99',
                title: 'Fix auth bug',
                url: 'https://linear.app/issue/ENG-99',
              },
            },
          },
        }),
      } as any);

      const result = await linear.executeAction(
        'issue.create',
        { accessToken: 'lin_api_key_xyz', metadata: {} },
        { teamId: 'ENG', title: 'Fix auth bug' },
      );

      expect(result.success).toBe(true);
      expect(result.output?.identifier).toBe('ENG-99');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
        }),
      );

      fetchSpy.mockRestore();
    });
  });

  describe('4. Discord Adapter', () => {
    it('should execute message.send via Discord REST API v10', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: '123456789012345678',
          channel_id: '9876543210',
          content: 'Alert: Server CPU at 95%',
          timestamp: '2026-11-12T18:00:00Z',
        }),
      } as any);

      const result = await discord.executeAction(
        'message.send',
        { accessToken: 'MTAxMjM0NTY3ODkw.test.token', metadata: {} },
        { channelId: '9876543210', content: 'Alert: Server CPU at 95%' },
      );

      expect(result.success).toBe(true);
      expect(result.output?.id).toBe('123456789012345678');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://discord.com/api/v10/channels/9876543210/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bot MTAxMjM0NTY3ODkw.test.token',
          }),
        }),
      );

      fetchSpy.mockRestore();
    });
  });

  describe('5. Notion Adapter', () => {
    it('should execute page.create with parentDatabaseId', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'notion-page-uuid-777',
          url: 'https://notion.so/my-page-777',
          created_time: '2026-11-12T18:00:00.000Z',
        }),
      } as any);

      const result = await notion.executeAction(
        'page.create',
        { accessToken: 'secret_notion_token_123', metadata: {} },
        {
          title: 'Q4 Product Roadmap',
          parentDatabaseId: 'db-uuid-888',
          content: 'Key objectives for Q4...',
        },
      );

      expect(result.success).toBe(true);
      expect(result.output?.id).toBe('notion-page-uuid-777');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer secret_notion_token_123',
            'Notion-Version': '2022-06-28',
          }),
        }),
      );

      fetchSpy.mockRestore();
    });
  });
});

