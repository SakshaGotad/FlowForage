import { ExecutionContext } from './action-dispatcher.interface';

/**
 * Resolves field mapping template expressions into concrete values.
 *
 * Template syntax:
 * - '{{trigger.output.title}}'          → extracts title from trigger output
 * - '{{trigger.output.issue.number}}'   → extracts nested path
 * - '{{steps.step_1.output.taskId}}'    → extracts from previous step output
 * - 'Fix: {{trigger.output.title}}'     → string interpolation
 * - 'static-value'                      → used as-is (no template)
 */
export interface IFieldMappingResolver {
  /**
   * Resolve all template expressions in an input mapping dictionary.
   *
   * @param inputMapping - dictionary of fieldName → template/static string
   * @param context      - execution context containing trigger + step outputs
   * @returns resolved dictionary with concrete values ready for the action API
   */
  resolve(
    inputMapping: Record<string, string>,
    context: ExecutionContext,
  ): Record<string, any>;

  /**
   * Resolve a single template string.
   *
   * @param template - string possibly containing {{...}} expressions
   * @param context  - execution context
   * @returns resolved value (can be string, number, object, etc. if pure expression)
   */
  resolveExpression(template: string, context: ExecutionContext): any;
}
