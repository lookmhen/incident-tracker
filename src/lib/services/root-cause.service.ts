import prisma from '@/lib/prisma';
import { IncidentServiceError } from './incident-errors';

export interface RootCauseNode {
  name: string;
  children: string[];
}

const DEFAULT_ROOT_CAUSE_TREE: RootCauseNode[] = [
  { name: 'Human', children: ['User Knowledge Gap', 'Security Control'] },
  { name: 'System', children: ['Program Defect', 'SAP Configuration', 'Procedure Gap'] },
  { name: 'Data', children: ['Master Data Quality', 'Authorization'] },
];

export class RootCauseService {
  private static readonly ROOT_CAUSE_OPTIONS_KEY = 'root_cause_options';

  private static cloneDefaultTree(): RootCauseNode[] {
    return DEFAULT_ROOT_CAUSE_TREE.map((n) => ({ name: n.name, children: [...n.children] }));
  }

  private static cleanLabel(raw: string, label: string): string {
    const clean = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!clean) throw new IncidentServiceError(`${label} name is required`, 400);
    if (clean.includes('>')) {
      throw new IncidentServiceError(`${label} name cannot contain ">"`, 400);
    }
    return clean;
  }

  private static dedupeChildren(children: unknown[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of children) {
      if (typeof item !== 'string') continue;
      const clean = item.trim().replace(/\s+/g, ' ');
      if (!clean || clean.includes('>')) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
    return out;
  }

  private static async saveTree(tree: RootCauseNode[], client: Pick<typeof prisma, 'integrationConfig'> = prisma): Promise<RootCauseNode[]> {
    const value = JSON.stringify(tree);
    await client.integrationConfig.upsert({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
      update: { value, isEnabled: true },
      create: { key: this.ROOT_CAUSE_OPTIONS_KEY, value, isEnabled: true },
    });
    return tree;
  }

  public static async getRootCauseTree(): Promise<RootCauseNode[]> {
    const row = await prisma.integrationConfig.findUnique({
      where: { key: this.ROOT_CAUSE_OPTIONS_KEY },
    });
    if (!row?.value) return this.cloneDefaultTree();

    try {
      const parsed = JSON.parse(row.value);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return this.cloneDefaultTree();
      }

      // Backward-compatible migration: flat string[] -> RootCauseNode[]
      if (parsed.every((v) => typeof v === 'string')) {
        const defaultMap = new Map(
          DEFAULT_ROOT_CAUSE_TREE.map((d) => [d.name.toLowerCase(), d])
        );
        const byParent = new Map<string, RootCauseNode>();
        const ordered: RootCauseNode[] = [];

        const ensureParent = (parentName: string, useDefaults: boolean) => {
          const key = parentName.toLowerCase();
          const existing = byParent.get(key);
          if (existing) return existing;
          const matched = useDefaults ? defaultMap.get(key) : undefined;
          const node: RootCauseNode = matched
            ? { name: matched.name, children: [...matched.children] }
            : { name: parentName, children: [] };
          byParent.set(key, node);
          ordered.push(node);
          return node;
        };

        for (const raw of parsed) {
          const clean = raw.trim().replace(/\s+/g, ' ');
          if (!clean) continue;
          if (clean.includes('>')) {
            const parts = clean.split('>').map((p) => p.trim()).filter(Boolean);
            if (parts.length !== 2) continue;
            const node = ensureParent(parts[0], false);
            if (!node.children.some((c) => c.toLowerCase() === parts[1].toLowerCase())) {
              node.children.push(parts[1]);
            }
          } else {
            ensureParent(clean, true);
          }
        }

        return ordered.length > 0 ? ordered : this.cloneDefaultTree();
      }

      // Standard RootCauseNode[] normalization & deduplication
      const byParent = new Map<string, RootCauseNode>();
      const ordered: RootCauseNode[] = [];

      for (const item of parsed) {
        if (!item || typeof item !== 'object' || typeof (item as any).name !== 'string') continue;
        const cleanName = (item as any).name.trim().replace(/\s+/g, ' ');
        if (!cleanName || cleanName.includes('>')) continue;
        const childrenRaw = Array.isArray((item as any).children) ? (item as any).children : [];
        const children = this.dedupeChildren(childrenRaw);
        const key = cleanName.toLowerCase();
        const existing = byParent.get(key);
        if (existing) {
          existing.children = this.dedupeChildren([...existing.children, ...children]);
        } else {
          const node: RootCauseNode = { name: cleanName, children };
          byParent.set(key, node);
          ordered.push(node);
        }
      }

      return ordered.length > 0 ? ordered : this.cloneDefaultTree();
    } catch {
      return this.cloneDefaultTree();
    }
  }

  public static async getRootCauseOptions(): Promise<string[]> {
    const tree = await this.getRootCauseTree();
    return tree.flatMap((node) =>
      node.children.length > 0
        ? node.children.map((child) => `${node.name} > ${child}`)
        : [node.name]
    );
  }

  public static async addRootCauseParent(name: string): Promise<RootCauseNode[]> {
    const clean = this.cleanLabel(name, 'Root cause parent');
    const tree = await this.getRootCauseTree();
    if (tree.some((n) => n.name.toLowerCase() === clean.toLowerCase())) {
      throw new IncidentServiceError(`Root cause parent "${clean}" already exists`, 400);
    }
    const next = [...tree, { name: clean, children: [] }];
    return this.saveTree(next);
  }

  public static async renameRootCauseParent(oldName: string, newName: string): Promise<RootCauseNode[]> {
    const cleanOld = this.cleanLabel(oldName, 'Old parent');
    const cleanNew = this.cleanLabel(newName, 'New parent');
    const tree = await this.getRootCauseTree();

    const idx = tree.findIndex((n) => n.name.toLowerCase() === cleanOld.toLowerCase());
    if (idx === -1) {
      throw new IncidentServiceError(`Root cause parent "${cleanOld}" not found`, 404);
    }
    if (tree.some((n, i) => i !== idx && n.name.toLowerCase() === cleanNew.toLowerCase())) {
      throw new IncidentServiceError(`Root cause parent "${cleanNew}" already exists`, 400);
    }

    const actualOld = tree[idx].name;
    const next = tree.map((n, i) => (i === idx ? { ...n, name: cleanNew } : n));

    await prisma.$transaction(async (tx) => {
      await this.saveTree(next, tx);

      if (actualOld !== cleanNew) {
        const oldLower = actualOld.toLowerCase();
        const prefix = `${actualOld} > `;
        const prefixLower = prefix.toLowerCase();
        const candidateRows = await tx.incident.findMany({
          where: { rootCause: { startsWith: actualOld } },
          select: { id: true, rootCause: true },
        });
        for (const row of candidateRows) {
          if (!row.rootCause) continue;
          const lower = row.rootCause.toLowerCase();
          if (lower === oldLower) {
            await tx.incident.update({
              where: { id: row.id },
              data: { rootCause: cleanNew },
            });
          } else if (lower.startsWith(prefixLower)) {
            await tx.incident.update({
              where: { id: row.id },
              data: { rootCause: `${cleanNew} > ${row.rootCause.slice(prefix.length)}` },
            });
          }
        }
      }
    });

    return next;
  }

  public static async deleteRootCauseParent(name: string): Promise<RootCauseNode[]> {
    const clean = this.cleanLabel(name, 'Root cause parent');
    const tree = await this.getRootCauseTree();
    const idx = tree.findIndex((n) => n.name.toLowerCase() === clean.toLowerCase());
    if (idx === -1) {
      throw new IncidentServiceError(`Root cause parent "${clean}" not found`, 404);
    }
    if (tree.length <= 1) {
      throw new IncidentServiceError('At least one root cause parent is required', 400);
    }
    const next = tree.filter((_, i) => i !== idx);
    return this.saveTree(next);
  }

  public static async addRootCauseChild(parentName: string, childName: string): Promise<RootCauseNode[]> {
    const cleanParent = this.cleanLabel(parentName, 'Root cause parent');
    const cleanChild = this.cleanLabel(childName, 'Sub-branch');
    const tree = await this.getRootCauseTree();

    const idx = tree.findIndex((n) => n.name.toLowerCase() === cleanParent.toLowerCase());
    if (idx === -1) {
      throw new IncidentServiceError(`Root cause parent "${cleanParent}" not found`, 404);
    }
    if (tree[idx].children.some((c) => c.toLowerCase() === cleanChild.toLowerCase())) {
      throw new IncidentServiceError(
        `Sub-branch "${cleanChild}" already exists under "${tree[idx].name}"`,
        400
      );
    }

    const next = tree.map((n, i) =>
      i === idx ? { ...n, children: [...n.children, cleanChild] } : n
    );
    return this.saveTree(next);
  }

  public static async renameRootCauseChild(
    parentName: string,
    oldChild: string,
    newChild: string
  ): Promise<RootCauseNode[]> {
    const cleanParent = this.cleanLabel(parentName, 'Root cause parent');
    const cleanOld = this.cleanLabel(oldChild, 'Old sub-branch');
    const cleanNew = this.cleanLabel(newChild, 'New sub-branch');
    const tree = await this.getRootCauseTree();

    const pIdx = tree.findIndex((n) => n.name.toLowerCase() === cleanParent.toLowerCase());
    if (pIdx === -1) {
      throw new IncidentServiceError(`Root cause parent "${cleanParent}" not found`, 404);
    }
    const cIdx = tree[pIdx].children.findIndex((c) => c.toLowerCase() === cleanOld.toLowerCase());
    if (cIdx === -1) {
      throw new IncidentServiceError(
        `Sub-branch "${cleanOld}" not found under "${tree[pIdx].name}"`,
        404
      );
    }
    if (tree[pIdx].children.some((c, i) => i !== cIdx && c.toLowerCase() === cleanNew.toLowerCase())) {
      throw new IncidentServiceError(
        `Sub-branch "${cleanNew}" already exists under "${tree[pIdx].name}"`,
        400
      );
    }

    const actualParent = tree[pIdx].name;
    const actualOldChild = tree[pIdx].children[cIdx];
    const next = tree.map((n, i) =>
      i === pIdx
        ? { ...n, children: n.children.map((c, j) => (j === cIdx ? cleanNew : c)) }
        : n
    );

    await prisma.$transaction(async (tx) => {
      await this.saveTree(next, tx);
      if (actualOldChild !== cleanNew) {
        await tx.incident.updateMany({
          where: { rootCause: `${actualParent} > ${actualOldChild}` },
          data: { rootCause: `${actualParent} > ${cleanNew}` },
        });
      }
    });

    return next;
  }

  public static async deleteRootCauseChild(parentName: string, childName: string): Promise<RootCauseNode[]> {
    const cleanParent = this.cleanLabel(parentName, 'Root cause parent');
    const cleanChild = this.cleanLabel(childName, 'Sub-branch');
    const tree = await this.getRootCauseTree();

    const pIdx = tree.findIndex((n) => n.name.toLowerCase() === cleanParent.toLowerCase());
    if (pIdx === -1) {
      throw new IncidentServiceError(`Root cause parent "${cleanParent}" not found`, 404);
    }
    const nextChildren = tree[pIdx].children.filter(
      (c) => c.toLowerCase() !== cleanChild.toLowerCase()
    );
    if (nextChildren.length === tree[pIdx].children.length) {
      throw new IncidentServiceError(
        `Sub-branch "${cleanChild}" not found under "${tree[pIdx].name}"`,
        404
      );
    }

    const next = tree.map((n, i) => (i === pIdx ? { ...n, children: nextChildren } : n));
    return this.saveTree(next);
  }

  public static async addRootCauseOption(name: string): Promise<string[]> {
    const raw = String(name || '').trim().replace(/\s+/g, ' ');
    if (!raw) throw new IncidentServiceError('Root cause name is required', 400);

    if (raw.includes('>')) {
      const parts = raw.split('>');
      if (parts.length !== 2) {
        throw new IncidentServiceError('Root cause name cannot contain multiple ">"', 400);
      }
      const parent = this.cleanLabel(parts[0], 'Root cause parent');
      const child = this.cleanLabel(parts[1], 'Sub-branch');
      const tree = await this.getRootCauseTree();
      if (!tree.some((n) => n.name.toLowerCase() === parent.toLowerCase())) {
        await this.addRootCauseParent(parent);
      }
      await this.addRootCauseChild(parent, child);
      return this.getRootCauseOptions();
    }

    await this.addRootCauseParent(raw);
    return this.getRootCauseOptions();
  }

  public static async deleteRootCauseOption(name: string): Promise<string[]> {
    const raw = String(name || '').trim().replace(/\s+/g, ' ');
    if (!raw) throw new IncidentServiceError('Root cause name is required', 400);

    if (raw.includes('>')) {
      const parts = raw.split('>');
      if (parts.length !== 2) {
        throw new IncidentServiceError('Root cause name cannot contain multiple ">"', 400);
      }
      await this.deleteRootCauseChild(parts[0], parts[1]);
    } else {
      await this.deleteRootCauseParent(raw);
    }
    return this.getRootCauseOptions();
  }
}
