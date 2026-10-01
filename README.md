# Learning Studio

Learning Studio is a responsive SvelteKit workspace for building and delivering
language lessons. It includes a role-aware dashboard, Better Auth authentication,
SVAR Grid administration, persistent courses and templates, and a reusable lesson
editor with first-class Persian, Arabic, and bidirectional text support.

## Local setup

1. Install dependencies with `bun install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and
   `BETTER_AUTH_URL`. The auth URL must match the origin used to open the app.
3. Apply the PostgreSQL schema with `bun run db:migrate`.
4. Start the app with `bun run dev`.

For desktop development on another device or network address, run `bun run dev:desktop-public`
from `web-app`. It binds Vite to all IPv4 interfaces and sets `BETTER_AUTH_URL` to the machine's
outbound IPv4 address on port 5173. If that is not the address clients use, set
`DESKTOP_PUBLIC_HOST` to an IPv4 address assigned to this machine before starting the script.
Open the printed URL in a browser or pass it to the desktop executable with `-url`.
The loopback-only `bun run dev:desktop` remains available for local use.
Browsers on other devices may block microphone APIs on this HTTP URL; use trusted
HTTPS for browser voice features, or continue with text chat.

In development, the app creates a temporary administrator on the first request:

```text
username: admin
password: 123456
```

Set `BETTER_AUTH_BOOTSTRAP_ADMIN=false` to disable this behavior. Production does
not create that account unless bootstrap is explicitly enabled with the required
environment variables and a stronger password.

The application stores course metadata in `course`, ordered lesson documents in
`course_lesson`, responsive reusable layouts in `lesson_template`, and student
access/progress in `course_enrollment`. Lesson and template content is versioned
JSONB, while searchable and relational fields remain normal columns.

## Media uploads

The media manager accepts audio, video, and image uploads up to 25 MB. Uploaded
bytes are stored in `MEDIA_STORAGE_DIR` (default: `./data/media`) and served with
authenticated byte-range requests for media seeking. Mount that directory as a
persistent volume in production. Keep `BODY_SIZE_LIMIT` above 26 MB; the sample
configuration uses `27M` to allow the upload plus multipart overhead.

Run the main quality gates with:

```sh
bun test
bun run check
bun run lint
bun run build
```

## Personal AI connections

Chat and lesson explanations use an OpenAI-compatible connection saved by each signed-in user.

Set a stable encryption secret in `.env` before allowing users to save keys:

```dotenv
AI_CREDENTIAL_ENCRYPTION_KEY=replace-with-a-stable-random-secret
```

The encryption key protects user-provided API keys at rest. Keep it stable: changing it makes
previously saved keys unreadable. If it is omitted, the application falls back to
`BETTER_AUTH_SECRET`.

In **Account settings**, users can add multiple named **OpenAI Compatible** connections, each
with a provider base URL, exact model name, and personal API key. They choose one connection to
power the AI assistant. For example:

- Base URL: `https://api.openai.com/v1`
- Model name: `gpt-4.1-mini`

The raw key is encrypted before storage and never returned to the browser. The selected connection
is used only for that user’s chat and lesson explanations. The app validates the configured model
using the provider’s `/models` endpoint, then sends completions to `/chat/completions`.

Pricing, quotas, and model availability are determined by the chosen provider. Existing
conversation history is sent with streaming enabled. The application’s conversation-size limits
still apply.

Run `npm run test:chat` for mocked OpenAI-compatible API tests and `npm run check` for Svelte
and TypeScript checks.

## Project scaffolding

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@0.17.0 create --template minimal --types ts --add prettier eslint sveltekit-adapter="adapter:node" drizzle="database:postgresql+postgresql:postgres.js+docker:no" better-auth="demo:password" --install bun ./
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
