# Project Confluence

Open **Depths → Settings → Connection Hub** in The Great Lake. Existing Waves, Tides, Captain’s Profile, Crew, audio, meetings and exports keep their existing entry points and storage.

The launch screen and Connection Hub use the same verified email session. Follow the sign-in link in the browser profile where you requested it. A verified email opens existing Lake data stored under that address on this device. Guest access and existing local profiles can still be used on this device. Queued inbound email is available only to the verified Lake account matching the sender address.

### Account sync

In **Depths → Backup & Data**, choose **Turn on account sync** once. Verified sign-ins on other devices automatically load that account’s Tides, saved attachments, folders, Crew, Captain’s Profile and supported preferences. The app checks at launch, while open, when revisiting the tab, and after local saves. The device keeps its copy while offline. Use **Sync now** to check immediately or pause this device without removing its files or stopping other devices. For an item edited in two places, choose the version to keep in the sync panel. Other items can continue to sync while you decide.

Saved Lake data passes through the Lake server and is encrypted before storage in the account’s Supabase vault. The server holds the encryption key. Sync covers saved data in the main Lake app. Unsent drafts, device-specific settings, connector credentials, and Meeting Studio recordings stay outside the sync copy. Lake packages remain available as independent backups.

## Enable a Lake deployment

1. In the Lake’s Supabase project, run [the Confluence SQL](../supabase/confluence.sql). Configure Email Auth and allow the exact Lake callback, such as https://the-great-lake-bot.onrender.com/account/callback. The default Supabase sender has recipient and rate limits. Use an authorized test address or configure SMTP.
2. On Render set APP_ORIGIN to the exact HTTPS origin without a trailing slash. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CONFLUENCE_SUPABASE_SECRET and CONFLUENCE_ENCRYPTION_KEY. The Supabase secret is a server-only secret API key or legacy service-role key. Generate the encryption key with the command below and keep it with the deployment secrets. Back it up before storing any connections. Existing rows require the same key to decrypt.
3. Register the Slack and Google apps using the instructions below, then set their client IDs and secrets. Start with a private test workspace and mailbox. Open Connection Hub, sign in through the email link in the same browser, and authorize one account per provider. Run **Test connection** and then a known historical query for each.
4. Keep the account and connector secrets separate for each deployment. Preview callback URLs must correspond to that preview’s APP_ORIGIN.

### Lake-branded sign-in email

In Supabase Authentication → Emails, configure custom SMTP using your mail provider’s SMTP host, port, login and password. Set the sender name to **The Great Lake Bot** and the sender address to an address your provider has verified. Verify the sending domain in the provider’s DNS settings if required. Update the **Confirm sign up** and **Magic link or OTP** templates to say The Great Lake Bot and preserve the existing confirmation URL. Disable link tracking for authentication messages.

The browser proof lives in the profile where you requested the email. If your inbox is in another Chrome profile, copy the newest sign-in link into the profile that requested it. Supabase's default sender has two deliveries per project per hour and only sends to authorized team addresses.

- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

Generate a 32-byte token or key with:

    node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"

### Slack

Create a Slack app using the OAuth authorization code flow. Register APP_ORIGIN + /connections/oauth/slack/callback. Add these **user** scopes: search:read, channels:history, groups:history, im:history and mpim:history. Configure SLACK_CLIENT_ID and SLACK_CLIENT_SECRET. An administrator may need to approve the app. Access depends on the connecting user’s workspace and the conversation type. Look up a historical phrase, open its thread and follow the pagination when available.

The implementation uses the Slack Web API search.messages and conversations.replies. This is an on-demand user-token route for a registered Slack app. The Real-time Search API offers granular search permissions, and Slack MCP offers a distinct installation and tool surface. These routes were evaluated for later adapters. Slack may impose distribution-specific limits on thread retrieval.

- [Installing via Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/)
- [Message search](https://docs.slack.dev/reference/methods/search.messages/)
- [Thread retrieval](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Real-time Search API](https://docs.slack.dev/apis/web-api/real-time-search-api/)
- [Slack MCP](https://docs.slack.dev/ai/slack-mcp-server/)

### Gmail

Enable the Gmail API in Google Cloud. Configure the OAuth consent screen and a Web application client. Register APP_ORIGIN + /connections/oauth/gmail/callback and add an authorized test user if the app is in Testing. Configure GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET. The adapter requests gmail.readonly for server-side message search, thread detail, labels and attachment downloads up to 5 MB. A Google app in external Testing ordinarily receives Gmail refresh tokens that expire after seven days.

Complete the applicable Google verification and review the Limited Use, hosting and processor requirements before broad rollout. Enable CONFLUENCE_GMAIL_SYNTHESIS=true only after confirming the intended processing is approved. Search, thread retrieval and downloads work with this value unset. Publishing a public OAuth app also requires the deployment’s privacy disclosures. The Gmail MCP transport has separate authorization/configuration and has not been activated for the Lake.

- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail search](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Gmail attachments](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Gmail MCP setup](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server)

### Instagram and Facebook

- **Instagram Professional.** Configure Business Login for Instagram in a Meta app, register APP_ORIGIN + /connections/oauth/instagram/callback, and set INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET to the Instagram app credentials. Grant instagram_business_basic to browse and search available media captions. To also browse available conversations and read threads, enable the applicable Meta messaging setup and grant instagram_business_manage_messages, then set INSTAGRAM_ENABLE_INBOX=true.
- **Facebook Page.** Register APP_ORIGIN + /connections/oauth/facebook/callback on a dedicated Facebook Login for Business app, create a configuration that returns a User token with pages_show_list and pages_read_engagement, and set FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET, FACEBOOK_LOGIN_CONFIG_ID and FACEBOOK_PAGE_ID. The authorizing user must manage the configured Page. For Page inbox access, add pages_manage_metadata and pages_messaging to the configuration, set FACEBOOK_ENABLE_INBOX=true, and authorize with the Page’s messaging permission. Disconnect attempts to revoke authorization for the dedicated Facebook app.

Meta controls eligibility and App Review. Both connectors read only available data from the authorized asset. Search matches captions or post text on the retrieved pages. Inbox reads are on demand and can have provider history limits. The app never sends or publishes on Meta, and Meta content is excluded from model synthesis. Disconnect Instagram in the Hub to delete local credentials and remove the app authorization in Instagram if provider revocation is still needed. Personal Instagram accounts and personal Facebook Messenger inboxes are outside these direct APIs. The Lake does not currently import personal Meta archives.

- [Instagram login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Instagram conversations](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/conversations-api)
- [Facebook Page posts](https://developers.facebook.com/docs/graph-api/reference/page/published_posts/)
- [Facebook Page conversations](https://developers.facebook.com/docs/graph-api/reference/page/conversations)

### Additional candidates

Microsoft Graph and Google Workspace APIs are candidates for separate delegated adapters with their own consent scopes. Personal WhatsApp has a browser-local text-export workflow. Meta’s WhatsApp Business Platform is a distinct business messaging integration. Android SMS/MMS permissions are subject to the device and Google Play requirements, and RCS access depends on the device and messaging platform. Apple Messages extensions run in the supported Messages app context.

- [Microsoft Graph](https://learn.microsoft.com/en-us/graph/)
- [Google Drive API](https://developers.google.com/workspace/drive/api/guides/about-sdk)
- [Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/overview)
- [Google People API](https://developers.google.com/people)
- [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/)
- [Android default handlers](https://developer.android.com/guide/topics/permissions/default-handlers)
- [Apple Messages](https://developer.apple.com/documentation/messages)

## Investigation and retention

Enter terms and applicable date operators for each participating provider, then enter the question to answer. The initial investigation examines up to two pages per selected source and can include the first page of a matching thread. The coverage panel reports the accounts, pages, continuation and errors. Expand relevant threads or search result pages individually. Evidence links open the originating record when available. Gmail uses plain-text excerpts or the provider snippet for HTML-only email. Downloaded attachments go directly to the requesting browser.

Optional synthesis sends the question and up to 24 bounded, numbered excerpts from the selected sources to the configured OpenAI API. The retrieval UI works independently of model analysis. Source content enters the model as quoted data and the synthesis request has no tools or outbound action permissions. Imported WhatsApp exports are parsed and searched in memory in the current browser tab.

The Lake retains encrypted OAuth credentials while connected. Disconnect deletes local credentials and attempts provider revocation. Check the reported result to confirm provider revocation. Activity history records operation, scope, time, outcome and whether information was shared or retained. It omits queries, excerpts and tokens. The current deployment retains activity records until the owning Lake account is deleted or the deployment operator removes records. SOURCE records are retained separately and support review and removal. Confluence does not migrate existing browser storage to cloud accounts.

The Connection Hub’s **Import a Lake package** picker transfers the selected file into the same browser profile’s existing restore flow. It supports unified ZIPs, full backup JSON and portable .lake files. The selected package is held temporarily in browser storage until the local Lake opens it for review. It is not sent to the server or synced to other devices.

## SOURCE protocol version 1

See [the Lake-side protocol](./source-protocol.md). Live pairing requires a deployed SOURCE counterpart on that contract. The portable JavaScript adapter module in confluence/providers.js accepts injected configuration and a fetch implementation. SOURCE can reuse it independently with its own authorization, account and token storage.

## Validation

Run npm test. The Confluence HTTP integration suite runs the real Lake routers and encrypted vault against simulated OAuth providers, Supabase PostgREST and a simulated SOURCE peer. The optional Chrome smoke test uses the running Lake and local fixtures. Set LAKE_PLAYWRIGHT_PATH or install Playwright in your test environment and run node tests/confluence-browser.cjs with LAKE_TEST_URL pointing to your test server.

Before enabling live credentials, use a preview or isolated pilot. Validate sign-in after a redirect, one historical Slack and Gmail query, both thread paths, Gmail attachment download, and pause/revocation. Check both directions against a deployed SOURCE peer before reporting the integration as operational. Scheduled jobs, background monitoring, outbound messages, model-directed tool execution, incremental sync, identity resolution across providers and a general MCP transport are outside this implementation.
