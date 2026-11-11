import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import {
  WorkflowService,
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from './workflow.service';
import { WorkflowStatus } from '../common/interfaces';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  /**
   * Helper to extract userId from headers or fallback body for API calls.
   */
  private getUserId(headers: Record<string, any>, body?: any): string {
    const userId = headers['x-user-id'] || body?.userId;
    if (!userId) {
      throw new BadRequestException(
        "User context required: Provide 'x-user-id' header or 'userId' in request body",
      );
    }
    return userId;
  }

  @Post()
  async createWorkflow(
    @Headers() headers: Record<string, any>,
    @Body() body: CreateWorkflowDto & { userId?: string },
  ) {
    const userId = this.getUserId(headers, body);
    return this.workflowService.createWorkflow(userId, body);
  }

  @Get()
  async listWorkflows(@Headers() headers: Record<string, any>) {
    const userId = this.getUserId(headers);
    return this.workflowService.listUserWorkflows(userId);
  }

  @Get(':id')
  async getWorkflow(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
  ) {
    const userId = this.getUserId(headers);
    return this.workflowService.getWorkflowById(id, userId);
  }

  @Put(':id')
  async updateWorkflow(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
    @Body() body: UpdateWorkflowDto & { userId?: string },
  ) {
    const userId = this.getUserId(headers, body);
    return this.workflowService.updateWorkflow(id, userId, body);
  }

  @Patch(':id/status')
  async updateStatus(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
    @Body() body: { status: WorkflowStatus; userId?: string },
  ) {
    const userId = this.getUserId(headers, body);
    if (!body.status) {
      throw new BadRequestException('Status is required');
    }
    return this.workflowService.updateStatus(id, userId, body.status);
  }

  @Delete(':id')
  async deleteWorkflow(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
  ) {
    const userId = this.getUserId(headers);
    await this.workflowService.deleteWorkflow(id, userId);
    return { success: true, message: `Workflow ${id} deleted successfully` };
  }
}

