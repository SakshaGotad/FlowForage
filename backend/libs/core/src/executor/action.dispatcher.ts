import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  IActionDispatcher,
  WorkflowStepDefinition,
  ExecutionContext,
  StepResult,
} from '../common/interfaces';
import { OperationRegistry } from '../registry/operation.registry';
import { AdapterRegistry } from '../providers/adapter.registry';
import { CredentialResolver } from '../connections/credential.resolver';
import { FieldMappingResolver } from './field-mapping.resolver';

@Injectable()
export class ActionDispatcher implements IActionDispatcher {
  private readonly logger = new Logger(ActionDispatcher.name);

  constructor(
    private readonly operationRegistry: OperationRegistry,
    private readonly adapterRegistry: AdapterRegistry,
    private readonly credentialResolver: CredentialResolver,
    private readonly fieldMappingResolver: FieldMappingResolver,
  ) {}

  /**
   * Executes a workflow step by resolving schemas, credentials, and invoking the provider adapter.
   */
  async dispatch(
    step: WorkflowStepDefinition,
    executionContext: ExecutionContext,
    userId: string,
  ): Promise<StepResult> {
    const startTime = Date.now();

    // 1. Verify operation exists in registry
    const actionDef = this.operationRegistry.getAction(
      step.provider,
      step.operationKey,
    );
    if (!actionDef) {
      throw new NotFoundException(
        `Action '${step.operationKey}' is not registered for provider '${step.provider}'`,
      );
    }

    // 2. Locate provider adapter
    const adapter = this.adapterRegistry.get(step.provider);
    if (!adapter) {
      throw new NotFoundException(
        `No adapter registered for provider '${step.provider}'`,
      );
    }

    // 3. Resolve field mapping
    const resolvedInput = this.fieldMappingResolver.resolve(
      step.inputMapping,
      executionContext,
    );

    this.logger.log(
      `Dispatching step '${step.id}' -> ${step.provider}.${step.operationKey}`,
    );

    // 4. Resolve credentials with user ownership verification
    const credentials = await this.credentialResolver.resolve(
      step.connectionId,
      userId,
    );

    // 5. Execute action via adapter
    try {
      const actionResult = await adapter.executeAction(
        step.operationKey,
        credentials,
        resolvedInput,
      );

      const durationMs = Date.now() - startTime;

      if (!actionResult.success) {
        return {
          success: false,
          error: actionResult.error,
          durationMs,
        };
      }

      return {
        success: true,
        output: actionResult.output,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `Failed executing step '${step.id}' on ${step.provider}.${step.operationKey}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        error: {
          code: 'ADAPTER_EXECUTION_EXCEPTION',
          message: error.message || 'Unknown error occurred during action execution',
          retryable: true,
          providerResponse: error,
        },
        durationMs,
      };
    }
  }
}

