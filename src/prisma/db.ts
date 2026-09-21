import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

const createDbClient = () =>
  postgres<Contract>({
    contractJson,
    url: process.env['DATABASE_URL']!,
  });

type DbClient = ReturnType<typeof createDbClient>;

const globalForDb = globalThis as unknown as { db: DbClient | undefined };

export const db = globalForDb.db ?? createDbClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db;
}
