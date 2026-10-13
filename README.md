# Everything Bots

Owner workspace: https://bot.lb000.xyz  
Member verification: https://verify.lb000.xyz

The two hostnames share the existing `verify-portal` Worker and `VerificationRegistry` Durable Object named `community`. The member records, encrypted consent tokens, server selection and transfer history stay in their existing namespace. The deployed verification module was preserved before this change. Bot configuration uses additional `bot:` storage keys. There is no member deletion or database replacement migration.

Sign in with the existing owner Discord account. Use **Bot settings** to edit the name, picture and description. **Activate commands** connects Discord interactions and registers slash commands. Existing unrelated application commands are preserved. Connect additional applications you own from Overview; their bot tokens are encrypted at rest and never returned to the browser.

Moderation includes warnings, timeout, kick, ban/unban, role changes, message cleanup, channel lock/unlock, slowmode and announcements. Live Discord permissions and role hierarchy are checked on every action. Admin checker reports actual server permissions. Configure a support role to enable private `/ticket` channels; `/close` archives their access without deleting messages.

Vouchers have a server, code, reward, claim limit and expiry. `/redeem` records one claim per member. Optional Discord role rewards are delivered by the bot. Other rewards are recorded for manual fulfilment; no separate financial wallet is created. Ambiguous role delivery is marked `needs_review` rather than issued again.

## Development and deployment

Node 22+ and Wrangler 4 are required. Run `npm install`, `npm test`, `npm run check`, then `npm run deploy` using an authenticated Cloudflare account. The checked-in configuration targets the existing `verify-portal` service and preserves its bindings and secrets. Never rename or delete its Durable Object class or the `community` object. Do not publish tokens, `.dev.vars`, snapshots or deployment keys.

Existing Cloudflare secrets: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `OWNER_DISCORD_ID`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `BOT_ADMIN_KEY`. OAuth continues using the registered callback `https://verify.lb000.xyz/oauth/callback`. Owner login transfers to the bot domain using a short-lived, single-use ticket bound to the browser; cookies remain host-only.

The deployment-only `/api/setup-primary` endpoint requires `BOT_DEPLOY_KEY`. Provision a random temporary key for a first deployment, call it once to connect the primary bot, and remove the key immediately. Normal configuration uses the signed owner session instead.

GitHub contains source code; the Cloudflare worker runs the dashboard and Discord HTTP interactions. Pushes alone do not deploy without a configured deployment workflow.

## AI ticket support

The Support tickets page has an AI switch, a server support guide, a preview that does not post to Discord, and per-ticket pause/resume controls. Workers AI runs `@cf/meta/llama-3.2-3b-instruct` using the server guide and up to ten messages from the same private ticket. No external model API key is needed. Ticket text is processed by Cloudflare Workers AI; no messages from other channels or verified-member records are included.

Private tickets use the selected support role if configured. Server administrators retain access without a support role. `/ticket question:<your question>` starts a ticket and can supply the first question. Normal new ticket messages are checked about every 15 seconds by the existing Durable Object's alarm. A once-per-minute schedule recovers the monitor after a deployment. Existing historical tickets are initialized for future messages rather than receiving surprise replies to old messages.

`/human` pauses AI. `/airesume` requires Manage Channels and resumes replies to new messages. Staff replies pause the assistant automatically. AI has no moderation or wallet tools, cannot confirm payments, and is instructed to send account-specific issues to staff. The shared daily inference allowance is 100 calls, with up to 20 replies per ticket per day. Duplicate messages are reserved atomically; ambiguous Discord delivery pauses the ticket for review instead of sending again.

The bot must have Message Content access to read ordinary ticket messages. Setup enables the limited Message Content flag through Discord's application API for eligible applications. For applications requiring Discord approval, enable or obtain that approval in the Discord Developer Portal. The dashboard's Test AI reply can verify the hosting model without posting in a ticket.

## Commands

`/help`, `/verify`, `/admincheck`, `/serverinfo`, `/userinfo`, `/ban`, `/unban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/clearwarnings`, `/purge`, `/lock`, `/unlock`, `/slowmode`, `/roleadd`, `/roleremove`, `/announce`, `/redeem`, `/ticket`, `/ticketpanel`, `/human`, `/airesume`, `/close`.

Discord may show the bot offline because this integration uses HTTP interactions rather than a gateway connection. Its slash commands still run while the worker is available. Changing online presence requires a separately hosted gateway process.

Use `/ticketpanel` in a channel to post a Request support button. Each click opens a private AI ticket, with the same one-open-ticket limit and staff handoff as `/ticket`. Posting requires Manage Channels.

New-server monitoring runs every minute. Existing servers start as Minecraft · Donut SMP. New servers trigger an owner DM with a 24-hour invite when Create Invite permission permits, a server link, and a type dropdown. Only the configured owner can select the category. Member sections deduplicate people per type without modifying verification records.

Both prefix and slash commands: `!stock Minecraft` (prefix only), `!buy` / `/buy`, `!say Title | Text` / `/say`, and `!setsection Name` / `/setsection name:Name`. Stock shows aggregate unique verified people with current future-transfer consent; it never exposes member IDs. Buy panels create separate staff-only tickets; AI is permanently disabled there. Setsection creates arbitrary sections and classifies the current server. Say supports repeated embeds with custom title, text, color and fields (Discord size limits apply). Only staff can post panels, classify servers and send embeds. Each completed transfer/retry batch sends an owner DM with added, already-present and failure counts. No payment or automatic transfer is performed by a purchase ticket. Prefix commands use a persistent Discord gateway connection with heartbeats, resuming and bounded reconnects.
