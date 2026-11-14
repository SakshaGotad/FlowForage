import { Module, Global } from '@nestjs/common';
import { AdapterRegistry } from './adapter.registry';
import { GitHubAdapter } from './github/github.adapter';
import { TodoistAdapter } from './todoist/todoist.adapter';
import { SlackAdapter } from './slack/slack.adapter';
import { LinearAdapter } from './linear/linear.adapter';
import { DiscordAdapter } from './discord/discord.adapter';
import { NotionAdapter } from './notion/notion.adapter';
import { RegistryModule } from '../registry/registry.module';

@Global()
@Module({
  imports: [RegistryModule],
  providers: [
    AdapterRegistry,
    GitHubAdapter,
    TodoistAdapter,
    SlackAdapter,
    LinearAdapter,
    DiscordAdapter,
    NotionAdapter,
  ],
  exports: [
    AdapterRegistry,
    GitHubAdapter,
    TodoistAdapter,
    SlackAdapter,
    LinearAdapter,
    DiscordAdapter,
    NotionAdapter,
  ],
})
export class ProvidersModule {}
