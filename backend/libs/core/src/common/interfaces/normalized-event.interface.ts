/**
 * The internal event representation that the workflow engine works with.
 *
 * After a provider-specific webhook/gateway event is validated and parsed,
 * it is converted into this uniform format. The workflow engine never sees
 * raw GitHub, Slack, or Discord event payloads — only NormalizedEvents.
 */
export interface NormalizedEvent {
  /** The provider that produced this event.
   *  Example: 'github', 'slack', 'discord' */
  provider: string;

  /** The trigger key this event corresponds to.
   *  Must match a registered TriggerDefinition.key for this provider.
   *  Example: 'issue.created', 'message.received' */
  triggerKey: string;

  /** Provider-assigned unique ID for this specific event delivery.
   *  Used for idempotent processing — duplicate events with the same ID are skipped.
   *  Example: GitHub's X-GitHub-Delivery header, Linear's webhook delivery ID. */
  externalEventId: string;

  /** The connection ID this event is associated with.
   *  Resolved during ingestion by matching the external account/workspace
   *  to a stored connection record. */
  connectionId: string;

  /** The external account or workspace identifier.
   *  Example: GitHub installation ID, Slack team ID, Discord guild ID.
   *  Used to route the event to the correct connection when connectionId
   *  is not directly available from the webhook payload. */
  externalAccountId: string;

  /** When this event occurred at the provider (provider's timestamp).
   *  Used for ordering and debugging, not for matching. */
  eventTimestamp: Date;

  /** The event payload, structured to match the trigger's outputSchema.
   *  This is what field mapping templates reference via {{trigger.output.*}} */
  payload: Record<string, any>;

  /** Provider's raw event data, preserved for debugging and troubleshooting.
   *  Never used by the engine for matching or execution logic. */
  rawPayload?: any;
}

