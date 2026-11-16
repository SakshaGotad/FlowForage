import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { ConnectionService } from './connection.service';
import { CredentialResolver } from './credential.resolver';
import { OAuthService } from './oauth.service';
import { ConnectionController } from './connection.controller';
import { DatabaseModule } from '../storage/database.module';
import { RegistryModule } from '../registry/registry.module';

@Module({
  imports: [DatabaseModule, RegistryModule],
  controllers: [ConnectionController],
  providers: [
    EncryptionService,
    ConnectionService,
    CredentialResolver,
    OAuthService,
  ],
  exports: [
    EncryptionService,
    ConnectionService,
    CredentialResolver,
    OAuthService,
  ],
})
export class ConnectionsModule {}
