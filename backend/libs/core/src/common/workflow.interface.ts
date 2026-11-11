// Re-export evolved interface types from the canonical location
export * from './interfaces/workflow.interface.js';

// Backward compatibility types for code being transitioned in Phase 3
export enum TriggerType {
  EVENT = 'event',
  CRON = 'cron',
}

export interface LegacyWorkflowStep {
  delay?: number;
  id: string;
  handler?: (payload: any) => Promise<any>;
  retry?: {
    attempts: number;
    backoff: number;
  };
}

export interface LegacyWorkflowDefinition {
  name: string;
  trigger?: {
    type: TriggerType;
    event: string;
    cron?: string;
  };
  steps: LegacyWorkflowStep[];
}
