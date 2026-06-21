# AIScrumBoard

An AI-driven Scrum orchestration platform where Claude Code sessions autonomously implement user stories.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 + shadcn/ui + Tailwind CSS |
| Backend API | Fastify + TypeScript |
| Database | PostgreSQL 16 + Drizzle ORM |
| Job Queue | BullMQ on Redis |
| Agent Runtime | Anthropic SDK in Docker containers |
| Auth | Better Auth (GitHub OAuth) |
| Real-time | SSE (board updates) + Redis streams (agent logs) |

## Quick Start

```bash
# 1. Clone and install
pnpm install

# 2. Configure environment
pnpm setup

# 3. Start infrastructure
cd infra/docker && docker compose up -d postgres redis

# 4. Run database migrations
pnpm db:migrate

# 5. Start development
pnpm dev
```

## Project Structure

```
apps/
  web/          Next.js frontend (port 3000)
  api/          Fastify API server (port 3001)
packages/
  db/           Drizzle ORM schema + migrations
  shared/       Shared types and constants
  agent-worker/ BullMQ workers + Claude agent implementations
infra/
  docker/       Docker Compose + Dockerfiles
scripts/        Setup wizard, seed, migrate
```

## Core Workflow

1. **Discovery**: Create a project, describe your concept → AI decomposes it into a backlog of user stories and SPIKEs
2. **Sprint Planning**: Review and organize the backlog, start a sprint
3. **Agentic Execution**: Each story is picked up by an independent Claude Code agent that implements it on a git branch
4. **QA Validation**: Completed stories trigger a QA agent that validates all acceptance criteria
5. **Acceptance**: Stories are auto-accepted (or rejected → re-queued) based on QA results

## Credit Management

The system monitors Anthropic API credit usage. When credits are exhausted:
- All active agent sessions pause cooperatively (checkpoint saved to DB)
- A cron job polls for credit restoration
- On restoration, agents resume from their exact checkpoint

## Environment Variables

See `.env.example` for all required variables. Run `pnpm setup` for an interactive wizard.