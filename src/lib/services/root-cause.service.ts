import prisma from '@/lib/prisma';
import { IncidentServiceError } from './incident-errors';

export class RootCauseService {
  private static readonly ROOT_CAUSE_OPTIONS_KEY = 'root_cause_options';
  private static readonly DEFAULT_ROOT_CAUSES = ['Human', 'System', 'Data'];

  public static async getRootCauseOptions(): Promise<string[]> {
    const row = await prisma.integrationConfig.findUnique({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
    });
    if (!row?.value) return [...this.DEFAULT_ROOT_CAUSES];
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
        if (cleaned.length > 0) return cleaned;
      }
    } catch {}
    return [...this.DEFAULT_ROOT_CAUSES];
  }

  public static async addRootCauseOption(name: string): Promise<string[]> {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new IncidentServiceError('Root cause name is required', 400);
    const current = await this.getRootCauseOptions();
    if (current.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      throw new IncidentServiceError(`Root cause "${clean}" already exists`, 400);
    }
    const next = [...current, clean];
    await prisma.integrationConfig.upsert({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
      update: { value: JSON.stringify(next), isEnabled: true },
      create: { key: this.ROOT_CAUSE_OPTIONS_KEY, value: JSON.stringify(next), isEnabled: true },
    });
    return next;
  }

  public static async deleteRootCauseOption(name: string): Promise<string[]> {
    const targetLower = name.trim().toLowerCase();
    const current = await this.getRootCauseOptions();
    const next = current.filter((c) => c.toLowerCase() !== targetLower);
    if (next.length === 0) {
      throw new IncidentServiceError('At least one root cause option is required', 400);
    }
    await prisma.integrationConfig.upsert({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
      update: { value: JSON.stringify(next), isEnabled: true },
      create: { key: this.ROOT_CAUSE_OPTIONS_KEY, value: JSON.stringify(next), isEnabled: true },
    });
    return next;
  }
}
