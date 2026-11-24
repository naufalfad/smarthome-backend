import { prisma } from './db.service.js';

export class ObjectCatalogService {
  static async listCatalogItems(options?: { category?: string; search?: string }) {
    const { category, search } = options || {};

    return prisma.objectCatalogItem.findMany({
      where: {
        isActive: true,
        ...(category && category !== 'ALL' && { category }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  static async getCatalogItemById(id: string) {
    return prisma.objectCatalogItem.findUnique({
      where: { id },
    });
  }

  static async getCategories() {
    const items = await prisma.objectCatalogItem.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return items.map((i) => i.category);
  }
}

