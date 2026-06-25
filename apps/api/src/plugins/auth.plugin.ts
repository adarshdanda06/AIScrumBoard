import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '../config/database.js';
import { getEnv } from '../config/env.js';
import * as schema from '@aiscrumboard/db';

let _auth: ReturnType<typeof betterAuth> | undefined;

export function getAuth() {
  if (!_auth) {
    const env = getEnv();
    const db = getDb();
    _auth = betterAuth({
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
          user: schema.users,
          session: schema.sessions,
          account: schema.accounts,
          verification: schema.verifications,
        },
      }),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      socialProviders: {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24,
      },
    });
  }
  return _auth;
}

export async function authPlugin(fastify: FastifyInstance) {
  const auth = getAuth();

  fastify.all('/api/auth/*', async (req: FastifyRequest, reply: FastifyReply) => {
    const response = await auth.handler(req.raw as Request);
    reply.status(response.status);
    response.headers.forEach((value, key) => {
      void reply.header(key, value);
    });
    const body = await response.text();
    return reply.send(body);
  });

  fastify.decorate('getSession', async (req: FastifyRequest) => {
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    return session;
  });
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const auth = getAuth();
  const session = await auth.api.getSession({
    headers: new Headers(req.headers as Record<string, string>),
  });
  if (!session?.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  req.user = session.user;
  req.session = session.session;
}

declare module 'fastify' {
  interface FastifyInstance {
    getSession: (req: FastifyRequest) => Promise<unknown>;
  }
  interface FastifyRequest {
    user: { id: string; email: string; name: string; role?: string };
    session: { id: string; expiresAt: Date };
  }
}
