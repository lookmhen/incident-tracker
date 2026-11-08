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
  const parts = dateStr.trim().split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00:00';

  const [d, m, y] = datePart.split('/').map(Number);
  if (!d || !m || !y) return null;

  // Convert Buddhist Era to Gregorian if year > 2400
  const gregorianYear = y > 2400 ? y - 543 : y;
  const [hh, mm] = timePart.split(':').map(Number);

  return new Date(Date.UTC(gregorianYear, m - 1, d, hh || 0, mm || 0, 0));
}
