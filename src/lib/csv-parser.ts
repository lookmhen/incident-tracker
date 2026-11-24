import fs from 'fs';
import path from 'path';

export interface CsvIncidentRow {
  id: string;
  senderName: string;
  incidentDate: string;
  incidentType: string;
  errorType: string;
  severity: string;
  status: string;
  detail: string;
  rootCause: string;
  resolutionDate: string;
}

export function parseCsvContent(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += c;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export function parseThaiDate(dateStr?: string | null): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  const str = dateStr.trim();

  // If already standard ISO or date string with T separator
  if (str.includes('T') && !isNaN(Date.parse(str))) {
    const d = new Date(str);
    return d.getUTCFullYear() < 2000 ? null : d;
  }

  const parts = str.split(/\s+/);
  const datePart = parts[0];
  const timePart = parts[1] || '00:00:00';

  // Support both '/' and '-' separators
  const separator = datePart.includes('/') ? '/' : datePart.includes('-') ? '-' : null;
  if (!separator) {
    const fallback = new Date(str);
    return isNaN(fallback.getTime()) || fallback.getUTCFullYear() < 2000 ? null : fallback;
  }

  const segments = datePart.split(separator).map(Number);
  if (segments.length !== 3 || segments.some(isNaN)) return null;

  let d: number, m: number, y: number;
  if (segments[0] > 1000) {
    // YYYY-MM-DD or YYYY/MM/DD
    [y, m, d] = segments;
  } else {
    // DD/MM/YYYY or DD-MM-YYYY
    [d, m, y] = segments;
  }

  // Expand 2-digit Thai BE (43..99 -> 2543..2599) or AD (< 43 -> 20xx) before Date.UTC (which maps 0..99 to 1900+y)
  const expandedYear = y >= 0 && y < 100 ? (y >= 43 ? 2500 + y : 2000 + y) : y;
  const gregorianYear = expandedYear > 2400 ? expandedYear - 543 : expandedYear;
  if (gregorianYear < 2000) return null;
  const [hh, mm, ss] = timePart.split(':').map(Number);

  return new Date(Date.UTC(gregorianYear, m - 1, d, hh || 0, mm || 0, ss || 0));
}
