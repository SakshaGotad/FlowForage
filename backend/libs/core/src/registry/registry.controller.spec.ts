import { Test, TestingModule } from '@nestjs/testing';
import { RegistryController } from './registry.controller';
import { IntegrationRegistry } from './integration.registry';
import { OperationRegistry } from './operation.registry';
import { NotFoundException } from '@nestjs/common';
import { AuthType, EventDeliveryType } from '../common/interfaces';

describe('RegistryController (Discovery API)', () => {
  let controller: RegistryController;
  let integrationRegistry: IntegrationRegistry;
  let operationRegistry: OperationRegistry;

  beforeEach(async () => {
    integrationRegistry = new IntegrationRegistry();
    operationRegistry = new OperationRegistry();

    // Register a sample integration
    integrationRegistry.register({
      key: 'slack',
      displayName: 'Slack',
      description: 'Slack integration',
      authType: AuthType.OAUTH2,
    });

    operationRegistry.registerTrigger({
      key: 'message.received',
      provider: 'slack',
      displayName: 'New Message',
      description: 'Triggers on new message',
      eventDelivery: EventDeliveryType.EVENTS_API,
      configSchema: null,
      outputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
      },
    });

    operationRegistry.registerAction({
      key: 'message.send',
      provider: 'slack',
      displayName: 'Send Message',
      description: 'Sends a message to channel',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, channel: { type: 'string' } },
        required: ['text', 'channel'],
      },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegistryController],
      providers: [
        { provide: IntegrationRegistry, useValue: integrationRegistry },
        { provide: OperationRegistry, useValue: operationRegistry },
      ],
    }).compile();

    controller = module.get<RegistryController>(RegistryController);
  });

  it('should return all integrations for App Catalog UI', () => {
    const list = controller.getAllIntegrations();
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe('slack');
  });

  it('should return single integration by provider key', () => {
    const item = controller.getIntegration('slack');
    expect(item.displayName).toBe('Slack');
  });

  it('should throw NotFoundException for unknown integration', () => {
    expect(() => controller.getIntegration('unknown-app')).toThrow(NotFoundException);
  });

  it('should return provider triggers with outputSchema', () => {
    const triggers = controller.getProviderTriggers('slack');
    expect(triggers).toHaveLength(1);
    expect(triggers[0].key).toBe('message.received');
    expect(triggers[0].outputSchema.properties).toHaveProperty('text');
  });

  it('should return provider actions with inputSchema', () => {
    const actions = controller.getProviderActions('slack');
    expect(actions).toHaveLength(1);
    expect(actions[0].key).toBe('message.send');
    expect(actions[0].inputSchema.properties).toHaveProperty('channel');
    expect(actions[0].inputSchema.required).toContain('text');
  });
});
