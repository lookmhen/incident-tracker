import prisma from '@/lib/prisma';

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
    const slug =
      data.slug ||
      data.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    return prisma.category.create({
      data: {
        name: data.name.trim(),
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
      description?: string;
      color?: string;
      isActive?: boolean;
    }
  ) {
    return prisma.category.update({
      where: { id },
      data,
    });
  }

  public static async deleteCategory(id: string) {
    return prisma.category.delete({
      where: { id },
    });
  }
}
