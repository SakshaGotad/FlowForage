/**
 * Evolved workflow definition.
 *
 * Key design improvements over the previous version:
 * 1. Fully serializable — no function references (step.handler eliminated)
 * 2. Provider-aware — steps reference provider + operationKey + connectionId
 * 3. Field mapping — steps define inputMapping templates
 * 4. Multi-tenant — workflows belong to a userId
 * 5. Lifecycle-managed — status (draft, active, paused) and versioning
 */

export interface WorkflowDefinition {
  id: string;
  userId: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  version: number;
  trigger: WorkflowTriggerConfig;
  steps: WorkflowStepDefinition[];
  createdAt: Date;
  updatedAt: Date;
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
}

/**
 * Configuration for the workflow trigger.
 * Replaces the previous { type, event, cron } shape.
 */
export interface WorkflowTriggerConfig {
  /** The provider that produces the trigger event.
   *  Example: 'github', 'slack', 'cron' */
  provider: string;

  /** The operation key for this trigger.
   *  Example: 'issue.created', 'message.received' */
  operationKey: string;

  /** The user's connection to use for this trigger.
   *  Foreign key to the Connection table.
   *  Optional for webhook triggers that route by external account ID. */
  connectionId?: string;

  /** Provider-specific trigger configuration options.
   *  Example: { repository: 'octocat/Hello-World' } for GitHub */
  config?: Record<string, any>;

  /** Cron expression for time-based triggers. Only used when provider is 'cron'. */
  cronExpression?: string;
}

/**
 * A single action step in a workflow.
 *
 * REPLACES the previous WorkflowStep which contained:
 *   handler?: (payload: any) => Promise<any>
 *
 * All properties are serializable to JSON and persistable in PostgreSQL.
 */
export interface WorkflowStepDefinition {
  /** Unique identifier within the workflow. Example: 'step_1', 'create_task' */
  id: string;

  /** The provider that executes this action. Must match IntegrationDefinition.key.
   *  Example: 'todoist', 'slack' */
  provider: string;

  /** The operation key for this action.
   *  Example: 'task.create', 'message.send' */
  operationKey: string;

  /** The connection to use for authentication when executing this action.
   *  Foreign key to the Connection table. */
  connectionId: string;

  /**
   * Field mappings from trigger/step outputs to this action's input fields.
   *
   * Example:
   * {
   *   "content": "{{trigger.output.title}}",
   *   "description": "{{trigger.output.body}}",
   *   "due_string": "tomorrow"
   * }
   */
  inputMapping: Record<string, string>;

  /**
   * Optional execution delay in milliseconds before this step runs.
   * When set, the workflow execution pauses and is re-enqueued via BullMQ delay.
   */
  delay?: number;

  /** Retry policy for this step when execution fails. */
  retry?: StepRetryPolicy;
}

export interface StepRetryPolicy {
  /** Maximum number of retry attempts. Default: 3 */
  maxAttempts: number;

  /** Base delay in milliseconds for exponential backoff. Default: 1000 */
  backoffMs: number;
}

