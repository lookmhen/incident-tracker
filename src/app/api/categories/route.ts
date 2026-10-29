import { NextRequest, NextResponse } from 'next/server';
import { CategoryService } from '@/lib/services/category.service';

export async function GET() {
  try {
    const categories = await CategoryService.getAllCategories();
    return NextResponse.json(categories);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const created = await CategoryService.createCategory({
      name: body.name,
      description: body.description,
      color: body.color,
      slug: body.slug,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create category' }, { status: 500 });
  }
}
