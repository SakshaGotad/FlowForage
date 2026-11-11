import { ActionError } from './provider-adapter.interface';
import { WorkflowStepDefinition } from './workflow.interface';

/**
 * Bridges the ExecutorService and the provider adapters.
 *
 * For each action step in a workflow, the ActionDispatcher:
 * 1. Resolves field mappings (substitutes {{trigger.output.*}} templates)
 * 2. Resolves credentials via CredentialResolver
 * 3. Calls the appropriate ProviderAdapter.executeAction()
 * 4. Records execution metrics and returns a standardized StepResult
 */
export interface IActionDispatcher {
  /**
   * Execute a single action step.
   *
   * @param step             - the step definition (provider, operationKey, connectionId, inputMapping)
   * @param executionContext - trigger output + previous step outputs
   * @param userId           - workflow owner's ID (for credential permission check)
   * @returns standardized step result
   */
  dispatch(
    step: WorkflowStepDefinition,
    executionContext: ExecutionContext,
    userId: string,
  ): Promise<StepResult>;
}

/**
 * The accumulated context available during workflow execution.
 *
 * Available to field mapping templates:
 * - {{trigger.output.fieldName}}
 * - {{steps.<stepId>.output.fieldName}}
 */
export interface ExecutionContext {
  /** The trigger event that started this workflow run. */
  trigger: {
    output: Record<string, any>;
  };

  /** Outputs from previously executed steps in this run, keyed by step ID. */
  steps: Record<
    string,
    {
      output: Record<string, any>;
    }
  >;
}

/**
 * Standardized result of executing one workflow step.
 */
export interface StepResult {
  success: boolean;
  output?: Record<string, any>;
  error?: ActionError;
  durationMs: number;
}
