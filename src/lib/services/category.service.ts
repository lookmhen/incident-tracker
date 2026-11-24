import prisma from '@/lib/prisma';
import { IncidentServiceError } from './incident-errors';

function buildCategorySlug(name: string): string {
  const raw = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || `cat-${Date.now()}`;
}

export class CategoryService {
  public static async getAllCategories() {
    return prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  public static async getActiveCategories() {
    return prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  public static async createCategory(data: {
    name: string;
    slug?: string;
    description?: string;
    color?: string;
  }) {
    const cleanName = data.name.trim();
    if (!cleanName) throw new IncidentServiceError('Category name is required', 400);
    const slug = data.slug?.trim() || buildCategorySlug(cleanName);

    return prisma.category.create({
      data: {
        name: cleanName,
        slug,
        description: data.description?.trim(),
        color: data.color || '#0284c7',
      },
    });
  }

  public static async updateCategory(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      color?: string;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new IncidentServiceError('Category not found', 404);
    }

    const updateData: {
      name?: string;
      slug?: string;
      description?: string | null;
      color?: string;
      isActive?: boolean;
    } = {};

    let nextName: string | undefined;
    if (data.name !== undefined) {
      nextName = data.name.trim();
      if (!nextName) {
        throw new IncidentServiceError('Category name is required', 400);
      }
      if (nextName !== existing.name) {
        const nextSlug = buildCategorySlug(nextName);
        const conflict = await prisma.category.findFirst({
          where: {
            id: { not: id },
            OR: [{ name: nextName }, { slug: nextSlug }],
          },
        });
        if (conflict) {
          throw new IncidentServiceError(`Category "${nextName}" already exists`, 400);
        }
        updateData.name = nextName;
        updateData.slug = nextSlug;
      }
    }

    if (data.description !== undefined) {
      updateData.description = data.description?.trim() || null;
    }
    if (data.color !== undefined) {
      const hex = data.color.trim();
      updateData.color = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#0284c7';
    }
    if (data.isActive !== undefined) {
      updateData.isActive = Boolean(data.isActive);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: updateData,
      });

      if (nextName && nextName !== existing.name) {
        await tx.incident.updateMany({
          where: {
            OR: [{ categoryId: id }, { category: existing.name }],
          },
          data: {
            category: nextName,
            categoryId: id,
          },
        });
      }

      return updated;
    });
  }

  public static async deleteCategory(id: string) {
    return prisma.category.delete({
      where: { id },
    });
  }
}
