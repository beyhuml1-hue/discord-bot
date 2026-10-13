# Verify bot — Wispbyte Python 3.11

## Start on Wispbyte

1. Pull the `main` branch from this repository.
2. In Startup set **Python file / PY_FILE** to `main.py` (replace `worker.mjs`).
3. Set **Requirements file / REQUIREMENTS_FILE** to `requirements.txt`.
4. Set `DISCORD_BOT_TOKEN` to your existing Verify bot token in private server variables. If Wispbyte does not offer custom variables, create a private `.env` file with `DISCORD_BOT_TOKEN=your_token`. Never commit it.
5. Ensure **Message Content Intent** is enabled for this bot in Discord Developer Portal → Bot.
6. Start the server. The console should say “Website connected”.

The bot's Python entry point is **main.py**. Install manually with `pip install -r requirements.txt` when needed. Do not run any website `.mjs` file with Python.

## Features

- `!stock Minecraft` (prefix only) counts unique verified people with active transfer permission. Custom sections work too.
- `!buy` or `/buy` posts a panel opening private staff-only purchase tickets with no AI.
- `!say Title | Text` or `/say` posts custom embeds. `/say` supports title, fields and color.
- `!setsection Name` or `/setsection` creates a section and classifies the current server.
- All existing moderation, vouchers, verification, AI support tickets, ticket panels, server info and admin-check slash commands continue working.
- New server joins send an owner DM with a link and type selector.
- Transfers send the owner a DM with successful, already-present and failed counts per batch.

## Website connection

Wispbyte runs the **Python Discord connection**. `bot.lb000.xyz` remains the shared website service for commands, private tickets, AI, vouchers and member data. `verify.lb000.xyz` remains the verification page. Existing member records are not copied or deleted. Slash commands and panel clicks continue reaching the website through the registered Discord interactions endpoint.

The `website/` folder contains the separately hosted Cloudflare backend and website source. These are not Wispbyte startup files. They remain JavaScript because Cloudflare Workers hosts the existing site. The website must remain online for command processing. Requests are signed using the existing bot token; the token is never included in requests or the repository. The website reads the real Discord message before handling a prefix command.

Once Python is connected, it takes a renewable 90-second lease. The Cloudflare gateway stands down to prevent duplicate prefix replies. If Python stops, the website can resume its gateway after the lease expires. Shared replay protection prevents a command being performed twice. A second Python instance is rejected while the first lease is active.

Do not create another bot token/application: use the existing Verify bot to keep the dashboard connected. Secrets and private environment files are excluded.

## Validation

Python: `python -m unittest discover -s tests_python`
Website: from `website/`, run `npm run check` and `npm test` using Node 24.
