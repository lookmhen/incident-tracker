export type WebhookSourceKey =
  | 'detail'
  | 'ticketNo'
  | 'title'
  | 'description'
  | 'reporterName'
  | 'department'
  | 'contactInfo'
  | 'urgency'
  | 'category'
  | 'custom';

export interface WebhookFieldMapping {
  key: string;
  source: WebhookSourceKey;
  template?: string;
}

export interface WebhookPayloadInput {
  ticketNo: string;
  title: string;
  description: string;
  reporterName: string;
  department?: string | null;
  contactInfo: string;
  urgency: string;
  category?: string | null;
  detail?: string;
  incident_type?: string;
}

export const WEBHOOK_SOURCE_OPTIONS: ReadonlyArray<{ value: WebhookSourceKey; label: string }> = [
  { value: 'detail', label: 'Formatted Detail (สรุปรวม)' },
  { value: 'ticketNo', label: 'Ticket No (ticketNo)' },
  { value: 'title', label: 'Title (หัวข้อปัญหา)' },
  { value: 'description', label: 'Description (รายละเอียด)' },
  { value: 'reporterName', label: 'Reporter Name (ผู้แจ้ง)' },
  { value: 'department', label: 'Department (แผนก)' },
  { value: 'contactInfo', label: 'Contact Info (ช่องทางติดต่อ)' },
  { value: 'urgency', label: 'Urgency (ความเร่งด่วน)' },
  { value: 'category', label: 'Category (หมวดหมู่)' },
  { value: 'custom', label: 'Custom Template ({{var}} / ข้อความ)' },
];

export const WEBHOOK_TEMPLATE_TOKENS: ReadonlyArray<Exclude<WebhookSourceKey, 'custom'>> = [
  'ticketNo',
  'title',
  'description',
  'reporterName',
  'department',
  'contactInfo',
  'urgency',
  'category',
  'detail',
];

export const DEFAULT_WEBHOOK_FIELDS: WebhookFieldMapping[] = [
  { key: 'detail', source: 'detail' },
  { key: 'urgency', source: 'urgency' },
  { key: 'incident_type', source: 'category' },
  { key: 'ticketNo', source: 'ticketNo' },
  { key: 'title', source: 'title' },
  { key: 'description', source: 'description' },
  { key: 'reporterName', source: 'reporterName' },
  { key: 'department', source: 'department' },
  { key: 'contactInfo', source: 'contactInfo' },
  { key: 'category', source: 'category' },
];

export const SAMPLE_WEBHOOK_PAYLOAD: WebhookPayloadInput = {
  ticketNo: 'INC-202611-0042',
  title: 'SAP GUI ค้างตอนเปิดเอกสาร',
  description: 'หน้าจอค้างหลังล็อกอิน ขึ้น Error timeout ที่เครื่อง Packing-02',
  reporterName: 'สมชาย ใจดี',
  department: 'Packing',
  contactInfo: 'Ext. 4412',
  urgency: 'HIGH',
  category: 'ERP / SAP',
};

const VALID_SOURCES = new Set<string>(WEBHOOK_SOURCE_OPTIONS.map((o) => o.value));
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isForbiddenWebhookKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key);
}

export function validateWebhookFields(
  fields: unknown
): { valid: true; fields: WebhookFieldMapping[] } | { valid: false; error: string } {
  if (!Array.isArray(fields) || fields.length === 0) {
    return { valid: false, error: 'At least one webhook field mapping is required.' };
  }

  const seen = new Set<string>();
  const normalized: WebhookFieldMapping[] = [];

  for (let i = 0; i < fields.length; i++) {
    const raw = fields[i];
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: `Invalid field mapping at row ${i + 1}.` };
    }
    const candidate = raw as Record<string, unknown>;
    const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
    if (!key) {
      return { valid: false, error: `JSON key cannot be empty (row ${i + 1}).` };
    }
    if (FORBIDDEN_KEYS.has(key)) {
      return { valid: false, error: `JSON key "${key}" is reserved and not allowed.` };
    }
    if (seen.has(key)) {
      return { valid: false, error: `Duplicate JSON key "${key}".` };
    }
    seen.add(key);

    const source = typeof candidate.source === 'string' ? candidate.source : '';
    if (!VALID_SOURCES.has(source)) {
      return { valid: false, error: `Invalid source "${source}" for key "${key}".` };
    }

    const typedSource = source as WebhookSourceKey;
    if (typedSource === 'custom') {
      normalized.push({
        key,
        source: typedSource,
        template: typeof candidate.template === 'string' ? candidate.template : '',
      });
    } else {
      normalized.push({ key, source: typedSource });
    }
  }

  return { valid: true, fields: normalized };
}

export function sanitizeStoredWebhookFields(fields: unknown): WebhookFieldMapping[] {
  const checked = validateWebhookFields(fields);
  return checked.valid ? checked.fields : DEFAULT_WEBHOOK_FIELDS.map((f) => ({ ...f }));
}

export function buildWebhookPayload(
  payload: WebhookPayloadInput,
  fields?: WebhookFieldMapping[]
): Record<string, string> {
  const ticketNo = payload.ticketNo ?? '';
  const title = payload.title ?? '';
  const description = payload.description ?? '';
  const reporterName = payload.reporterName ?? '';
  const department = payload.department ?? '';
  const contactInfo = payload.contactInfo ?? '';
  const urgency = payload.urgency ?? '';
  const category = payload.category || 'General IT';
  const detail =
    payload.detail ||
    `[${ticketNo}] ${title}\nรายละเอียด: ${description}\nผู้แจ้ง: ${reporterName} | แผนก: ${department || '-'} | ติดต่อ: ${contactInfo}`;

  const vars: Record<Exclude<WebhookSourceKey, 'custom'>, string> = {
    detail,
    ticketNo,
    title,
    description,
    reporterName,
    department,
    contactInfo,
    urgency,
    category,
  };

  const activeFields = fields && fields.length > 0 ? fields : DEFAULT_WEBHOOK_FIELDS;
  const out: Record<string, string> = {};

  for (const field of activeFields) {
    const key = field.key.trim();
    if (!key || FORBIDDEN_KEYS.has(key)) continue;

    if (field.source === 'custom') {
      const tpl = field.template ?? '';
      out[key] = tpl.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
        Object.prototype.hasOwnProperty.call(vars, token)
          ? vars[token as Exclude<WebhookSourceKey, 'custom'>]
          : ''
      );
    } else {
      out[key] = Object.prototype.hasOwnProperty.call(vars, field.source) ? vars[field.source] : '';
    }
  }

  return out;
}
