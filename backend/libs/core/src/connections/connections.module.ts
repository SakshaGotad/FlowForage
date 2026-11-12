import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { ConnectionService } from './connection.service';
import { CredentialResolver } from './credential.resolver';
import { OAuthService } from './oauth.service';
import { DatabaseModule } from '../storage/database.module';

@Module({
  imports: [DatabaseModule],
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
