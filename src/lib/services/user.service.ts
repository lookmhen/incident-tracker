import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import prisma from '@/lib/prisma';
import { normalizeRole, UserRole } from '@/lib/auth';

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UserServiceError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export function hashPassword(password: string): string {
  const saltHex = randomBytes(16).toString('hex');
  const hashHex = scryptSync(password, saltHex, 64).toString('hex');
  return `scrypt:${saltHex}:${hashHex}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!password || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, saltHex, hashHex] = parts;
  if (!saltHex || !hashHex || !/^[0-9a-f]+$/i.test(hashHex)) return false;

  try {
    const hashBuf = Buffer.from(hashHex, 'hex');
    const derived = scryptSync(password, saltHex, 64);
    if (hashBuf.length !== derived.length) return false;
    return timingSafeEqual(hashBuf, derived);
  } catch {
    return false;
  }
}

export class UserService {
  public static hashPassword = hashPassword;
  public static verifyPassword = verifyPassword;

  public static async listUsers(): Promise<PublicUser[]> {
    return prisma.adminUser.findMany({
      select: PUBLIC_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  public static async createUser(input: {
    username?: string;
    name: string;
    email?: string | null;
    role?: string | UserRole;
    password: string;
  }): Promise<PublicUser> {
    const cleanEmail = input.email?.trim().toLowerCase() || null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new UserServiceError('Invalid email format', 400);
    }

    const rawUsername = (input.username ?? '').trim();
    const username = rawUsername || cleanEmail || '';
    if (username.length < 2 || /\s/.test(username)) {
      throw new UserServiceError('Email or username is required (no spaces)', 400);
    }

    const name = (input.name ?? '').trim();
    if (!name) {
      throw new UserServiceError('Name is required', 400);
    }

    if (typeof input.password !== 'string' || input.password.length < 4) {
      throw new UserServiceError('Password must be at least 4 characters', 400);
    }

    const existing = await prisma.adminUser.findFirst({
      where: {
        OR: [
          { username },
          { username: username.toLowerCase() },
          ...(cleanEmail ? [{ email: cleanEmail }, { username: cleanEmail }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing) {
      throw new UserServiceError('Email or username already exists', 409);
    }

    return prisma.adminUser.create({
      data: {
        username: cleanEmail && !rawUsername ? cleanEmail : username,
        name,
        email: cleanEmail,
        role: normalizeRole(input.role),
        passwordHash: hashPassword(input.password),
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  public static async updateUser(
    id: string,
    data: {
      name?: string;
      email?: string | null;
      role?: string | UserRole;
      password?: string;
      isActive?: boolean;
    },
    actorUserId?: string | null
  ): Promise<PublicUser> {
    const existing = await prisma.adminUser.findUnique({
      where: { id },
      select: { id: true, username: true, email: true },
    });
    if (!existing) {
      throw new UserServiceError('User not found', 404);
    }

    if (
      actorUserId &&
      actorUserId === id &&
      ((data.role !== undefined && normalizeRole(data.role) === 'STAFF') || data.isActive === false)
    ) {
      throw new UserServiceError('Cannot demote or deactivate your own active account', 400);
    }

    const updateData: {
      username?: string;
      name?: string;
      email?: string | null;
      role?: UserRole;
      passwordHash?: string;
      isActive?: boolean;
    } = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        throw new UserServiceError('Name is required', 400);
      }
      updateData.name = name;
    }

    if (data.email !== undefined) {
      const nextEmail = data.email?.trim().toLowerCase() || null;
      if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        throw new UserServiceError('Invalid email format', 400);
      }
      if (nextEmail) {
        const conflict = await prisma.adminUser.findFirst({
          where: {
            id: { not: id },
            OR: [{ email: nextEmail }, { username: nextEmail }],
          },
          select: { id: true },
        });
        if (conflict) {
          throw new UserServiceError('Email already exists', 409);
        }
        // Keep email-based accounts' login username synced when their email changes
        if (existing.email && existing.username.toLowerCase() === existing.email.toLowerCase()) {
          updateData.username = nextEmail;
        }
      }
      updateData.email = nextEmail;
    }

    if (data.role !== undefined) {
      updateData.role = normalizeRole(data.role);
    }

    if (typeof data.isActive === 'boolean') {
      updateData.isActive = data.isActive;
    }

    if (typeof data.password === 'string' && data.password.length > 0) {
      if (data.password.length < 4) {
        throw new UserServiceError('Password must be at least 4 characters', 400);
      }
      updateData.passwordHash = hashPassword(data.password);
    }

    return prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: PUBLIC_USER_SELECT,
    });
  }

  public static async deleteUser(id: string, actorUserId?: string | null): Promise<void> {
    if (actorUserId && actorUserId === id) {
      throw new UserServiceError('Cannot delete your own active account', 400);
    }

    const existing = await prisma.adminUser.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new UserServiceError('User not found', 404);
    }

    await prisma.adminUser.delete({ where: { id } });
  }

  public static async authenticate(identifier: string, password: string): Promise<PublicUser | null> {
    const clean = (identifier ?? '').trim();
    if (!clean || !password) return null;
    const lower = clean.toLowerCase();

    const record = await prisma.adminUser.findFirst({
      where: {
        OR: [{ email: lower }, { username: clean }, { username: lower }],
      },
      select: {
        ...PUBLIC_USER_SELECT,
        passwordHash: true,
      },
    });

    if (!record || !record.isActive) return null;
    if (!verifyPassword(password, record.passwordHash)) return null;

    const { passwordHash: _ignored, ...safeUser } = record;
    return safeUser;
  }
}
