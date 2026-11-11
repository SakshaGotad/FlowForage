import { Module, Global } from '@nestjs/common';
import { AdapterRegistry } from './adapter.registry';
import { GitHubAdapter } from './github/github.adapter';
import { TodoistAdapter } from './todoist/todoist.adapter';
import { RegistryModule } from '../registry/registry.module';

@Global()
@Module({
  imports: [RegistryModule],
  providers: [AdapterRegistry, GitHubAdapter, TodoistAdapter],
  exports: [AdapterRegistry, GitHubAdapter, TodoistAdapter],
})
export class ProvidersModule {}
