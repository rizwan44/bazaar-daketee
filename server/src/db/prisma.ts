import { PrismaClient } from '@prisma/client';

/**
 * Single shared Prisma client for the process. Avoids exhausting MySQL
 * connections from creating a new client per request/module in dev with
 * hot-reload (tsx watch re-executes this module on change).
 */
export const prisma = new PrismaClient();
