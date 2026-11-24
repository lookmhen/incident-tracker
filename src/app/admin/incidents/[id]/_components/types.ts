export type { RootCauseNode } from '@/components/ManageRootCausesModal';

export interface RelatedIncidentSummary {
  id: string;
  ticketNo: string;
  title: string;
  status: string;
  category: string | null;
  rootCause: string | null;
  resolution: string | null;
  resolutionType: string | null;
  workaroundNote: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface IncidentAttachment {
  id: string;
  fileUrl: string;
  fileType: string;
  fileName: string | null;
  fileSize: number | null;
  kind?: string;
}

export interface IncidentDetail {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  reporterName: string;
  department: string | null;
  contactInfo: string;
  urgency: string;
  category: string | null;
  categoryId: string | null;
  categoryRel?: { id: string; name: string; color: string | null } | null;
  rootCause: string | null;
  status: string;
  assignedTo: string | null;
  resolution: string | null;
  resolutionType?: string | null;
  workaroundNote?: string | null;
  resolvedBy?: string | null;
  resolvedByExternal?: boolean;
  managerComment?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mttrExcluded?: boolean;
  relatedTickets?: string | null;
  relatedTicketNos?: string[];
  relatedIncidents?: RelatedIncidentSummary[];
  referencedBy?: RelatedIncidentSummary[];
  attachments: IncidentAttachment[];
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

export interface CurrentAdminUser {
  username: string;
  name: string;
  role: 'STAFF' | 'MANAGER';
}

export interface RelatedSearchResult {
  id: string;
  ticketNo: string;
  title: string;
  description?: string | null;
  resolution?: string | null;
  status: string;
  resolutionType?: string | null;
  category?: string | null;
}

export interface ResolutionFeedback {
  type: 'success' | 'error';
  text: string;
}
