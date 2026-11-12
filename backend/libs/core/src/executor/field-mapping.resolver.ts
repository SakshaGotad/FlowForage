import { Injectable } from '@nestjs/common';
import {
  IFieldMappingResolver,
  ExecutionContext,
} from '../common/interfaces';

@Injectable()
export class FieldMappingResolver implements IFieldMappingResolver {
  private readonly templateRegex = /\{\{\s*([\w.-]+)\s*\}\}/g;

  /**
   * Resolves a dictionary of field mappings against the execution context.
   */
  resolve(
    inputMapping: Record<string, string>,
    context: ExecutionContext,
  ): Record<string, any> {
    if (!inputMapping || typeof inputMapping !== 'object') {
      return {};
    }

    const result: Record<string, any> = {};

    for (const [key, template] of Object.entries(inputMapping)) {
      if (typeof template === 'string') {
        result[key] = this.resolveExpression(template, context);
      } else {
        result[key] = template;
      }
    }

    return result;
  }

  /**
   * Resolves a single template expression.
   *
   * Case 1: Pure single expression, e.g. "{{trigger.output.data}}"
   * -> Preserves original data type (e.g. object, number, boolean, array)
   *
   * Case 2: String with embedded template(s), e.g. "Issue #{{trigger.output.id}}: {{trigger.output.title}}"
   * -> Returns interpolated string
   *
   * Case 3: Plain static string with no template
   * -> Returns as-is
   */
  resolveExpression(template: string, context: ExecutionContext): any {
    if (!template || typeof template !== 'string') {
      return template;
    }

    const trimmed = template.trim();

    // Check if the whole string is exactly one expression: ^{{\s*([\w.-]+)\s*}}$
    const exactMatch = trimmed.match(/^\{\{\s*([\w.-]+)\s*\}\}$/);
    if (exactMatch) {
      const path = exactMatch[1];
      return this.getValueByPath(context, path);
    }

    // String interpolation for mixed or multiple templates
    if (template.includes('{{')) {
      return template.replace(this.templateRegex, (_, path) => {
        const val = this.getValueByPath(context, path);
        if (val === undefined || val === null) {
          return '';
        }
        if (typeof val === 'object') {
          return JSON.stringify(val);
        }
        return String(val);
      });
    }

    return template;
  }

  /**
   * Safe property path extractor (e.g. "trigger.output.issue.id").
   */
  private getValueByPath(obj: any, path: string): any {
    if (!obj || !path) {
      return undefined;
    }

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}

