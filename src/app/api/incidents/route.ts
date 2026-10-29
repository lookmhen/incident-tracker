import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/services/incident.service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const urgency = searchParams.get('urgency') || undefined;
    const category = searchParams.get('category') || undefined;
    const department = searchParams.get('department') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await IncidentService.getIncidents({
      search,
      status,
      urgency,
      category,
      department,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    let reporterName = '';
    let department = '';
    let contactInfo = '';
    let title = '';
    let description = '';
    let urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    let category = '';
    let categoryId = '';
    let filePayload: { buffer: Buffer; fileName: string; fileType: string; fileSize: number } | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      reporterName = formData.get('reporterName') as string;
      department = (formData.get('department') as string) || '';
      contactInfo = formData.get('contactInfo') as string;
      title = formData.get('title') as string;
      description = formData.get('description') as string;
      urgency = ((formData.get('urgency') as string) || 'MEDIUM') as any;
      category = (formData.get('category') as string) || '';
      categoryId = (formData.get('categoryId') as string) || '';

      const uploadedFile = formData.get('attachment') as File | null;
      if (uploadedFile && uploadedFile.size > 0) {
        if (uploadedFile.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'Attachment exceeds maximum size of 5MB' }, { status: 400 });
        }
        const arrayBuffer = await uploadedFile.arrayBuffer();
        filePayload = {
          buffer: Buffer.from(arrayBuffer),
          fileName: uploadedFile.name,
          fileType: uploadedFile.type || 'image/png',
          fileSize: uploadedFile.size,
        };
      }
    } else {
      const json = await req.json();
      reporterName = json.reporterName;
      department = json.department || '';
      contactInfo = json.contactInfo;
      title = json.title;
      description = json.description;
      urgency = json.urgency || 'MEDIUM';
      category = json.category || '';
      categoryId = json.categoryId || '';

      if (json.fileBase64 && json.fileName) {
        const buffer = Buffer.from(json.fileBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        if (buffer.length > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'Attachment exceeds maximum size of 5MB' }, { status: 400 });
        }
        filePayload = {
          buffer,
          fileName: json.fileName,
          fileType: json.fileType || 'image/png',
          fileSize: buffer.length,
        };
      }
    }

    // If contactInfo is not provided, fallback to '-' or department
    contactInfo = contactInfo?.trim() || department?.trim() || '-';

    if (!reporterName || !title || !description) {
      return NextResponse.json(
        { error: 'Please provide all required fields (reporterName, title, description)' },
        { status: 400 }
      );
    }

    const created = await IncidentService.createIncident({
      reporterName,
      department,
      contactInfo,
      title,
      description,
      urgency,
      category,
      categoryId,
      file: filePayload,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error('Error creating incident:', error);
    return NextResponse.json({ error: error.message || 'Failed to create incident' }, { status: 500 });
  }
}
