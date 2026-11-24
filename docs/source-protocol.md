# SOURCE and The Great Lake protocol v1

The Lake provides service endpoints at /api/intelligence/v1. The paired SOURCE installation implements the same three paths under its configured base URL. Each deployment owns its storage and authorizations. The Lake can use Slack and Gmail with SOURCE disabled.

## Pairing

Set CONFLUENCE_SOURCE_OWNER to the exact Supabase UUID of the verified Lake account and CONFLUENCE_SOURCE_WORKSPACE to the remote workspace identifier. Set CONFLUENCE_SOURCE_INBOUND_TOKEN to a random 32-byte base64url value. For Lake-to-SOURCE requests, set CONFLUENCE_SOURCE_URL to the peer HTTPS base and CONFLUENCE_SOURCE_OUTBOUND_TOKEN to a distinct random 32-byte base64url value expected by SOURCE. Configure the counterpart’s receiver to expect the corresponding Great Lake origin workspace, which is the Lake owner UUID. Both peers send their outbound token as an Authorization Bearer header. The Lake requires the paired owner to enable the pairing in Connection Hub before either direction is used.

The Lake connects only to the configured peer HTTPS URL and rejects HTTP redirects. Header authentication and workspace binding apply even when a sender supplies an otherwise valid record. Revoking the pairing stops later exchanges. A transfer already processed by SOURCE remains under SOURCE’s retention controls. Remove staged Lake context or received observations in the Lake Hub. Withdrawal preserves only identifiers needed to stop repeat imports and prevent superseded records from reappearing. Rotate the inbound or outbound token independently on both systems.

## Endpoints

| Method and relative path | Request | Successful response |
| --- | --- | --- |
| GET /health | No body | schema_version 1, system great-lake or source, status authorized |
| GET /context | Optional type and q parameters | schema_version 1 and records array |
| POST /observations | One version 1 record as JSON | schema_version 1, record_id and result created, updated or duplicate |

The Lake’s context endpoint exposes only context the user staged. It excludes private chats, provider messages, received SOURCE records, withdrawn records and superseded revisions. Type is one of preference, goal, boundary, priority, decision, observation, outcome or correction. Query is a case-insensitive substring match against the subject and observation. Each side should cap version 1 responses at 100 records. A clock-based sync cursor, webhook subscriptions and remote deletion require a subsequent protocol revision or compatible extension.

## Example SOURCE observation

```json
{
  "schema_version": 1,
  "record_id": "supplier-rollout-2025-06",
  "record_type": "outcome",
  "origin_system": "source",
  "origin_workspace": "source-team",
  "subject": "Supplier rollout",
  "observation": "The supplier confirmed receipt of the rollout plan.",
  "evidence_references": [{
    "origin_system": "gmail",
    "origin_workspace": "supplier-mail",
    "record_id": "msg-2",
    "timestamp": "2025-06-01T15:25:00.000Z"
  }],
  "user_stated_facts": [],
  "interpretation": "The rollout remains unverified.",
  "alternative_explanations": [],
  "confidence": 0.7,
  "created_at": "2025-06-01T15:25:00.000Z",
  "observed_at": "2025-06-01T15:25:00.000Z",
  "updated_at": "2025-06-01T15:25:00.000Z",
  "supersedes": null,
  "user_review_status": "unreviewed",
  "sensitivity": "shareable",
  "allowed_destinations": ["great-lake"],
  "retention_policy": "until_revoked"
}
```

IDs and original timestamps remain stable. Retry an identical record with the same updated_at to receive duplicate. A newer revision must keep the same created_at. An older revision or a different payload with the same updated_at gets HTTP 409. Cross-system scope violations and missing SOURCE evidence fail validation. An evidence reference can include an HTTPS URL. Use the underlying evidence ID on every derivation to identify repeated uses of the same evidence. Received SOURCE interpretations preserve their origin and Lake review status. The Lake never republishes a received record as a Lake-authored observation.

A Lake user may confirm, reject or correct an incoming interpretation. Corrections and rejections persist across later source revisions. A positive confirmation applies to the reviewed revision and needs review again when SOURCE submits a revision. Local SOURCE reviews and the existing Captain’s Profile remain independently editable. Publish a new Lake context record with supersedes set to the old Lake record ID to replace shared context.

The owning Game Intelligence module remains authoritative for its records. Represent the original module in evidence provenance. SOURCE can refer to RoadMap, Address Book or future modules without changing this protocol.
