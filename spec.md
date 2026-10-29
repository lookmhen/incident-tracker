# 📑 System Requirement Specification (SRS)
## Project: IT Incident Management System (MCP & AI Ready)
**Version:** 1.1  
**Status:** Approved for Development  

---

## 1. Project Overview (ภาพรวมโครงการ)
ระบบรับแจ้งและจัดการปัญหาด้าน IT ภายในองค์กร ที่เน้นความสะดวกรวดเร็วของฝั่งผู้ใช้งาน (Zero-Barrier UI: เปิดลิงก์แล้วพิมพ์แจ้ง/แนบรูปได้ทันที) พร้อมส่งแจ้งเตือนแบบ Interactive เข้า Microsoft Teams ทันที และถูกออกแบบสถาปัตยกรรมข้อมูลเบื้องหลังให้รองรับการเชื่อมต่อกับ **MCP (Model Context Protocol)** เพื่อใช้ AI (Local หรือ Global LLM) ในการวิเคราะห์ประวัติ สาเหตุปัญหา Insights, KPIs และ Recurring Cases ได้อย่างอิสระในอนาคต

---

## 2. Technical Stack (เทคโนโลยีที่เลือกใช้)

* **Frontend & Backend Framework:** Next.js (App Router, TypeScript)
* **Database:** SQLite (จัดการผ่าน Prisma ORM)
* **UI Framework:** Tailwind CSS (Glacier Core Design System)
* **Containerization:** Docker (Node.js 26 Alpine Base Image) Standalone Deployment (Pure Docker - ไม่ใช้ Apache)
* **Web Server:** Next.js Built-in Standalone HTTP Server ภายใน Docker Container
* **Integrations:** Microsoft Teams Webhook (Adaptive Cards)
* **Future Readiness:** MCP (Model Context Protocol Server Ready) รองรับการวิเคราะห์ Insights, KPI, Recurring Cases และ Root Cause Analysis

---

## 3. System Architecture (สถาปัตยกรรมระบบ)

```text
[ User Browser ]
       │ (HTTP/S Port 3000)
       ▼
[ Docker Container: Alpine Node 26 ]
 ├── Next.js (Standalone Mode)
 └── Prisma ORM
       │
       ├─► [ SQLite File: ./data/incident.db ] (Docker Volume Mapping)
       └─► [ Microsoft Teams Channel ] (Incoming Webhook)

-----------------------------------------------------------------------
[ Future AI / MCP Phase ]
[ MCP Server (Node/Python) ] ── (Read Access / API) ──► [ ./data/incident.db ] ◄──► [ Local/Global LLM ]
                                                            ├── Historical Insights & KPIs
                                                            ├── Recurring Case Detection
                                                            └── Root Cause Analysis (RCA)
```

---

## 4. Core Features & Functional Requirements

### 4.1 ฝั่ง User (Public Incident Form)
* **Zero Barrier Access:** เข้าใช้งานผ่าน Link / QR Code โดยไม่ต้องทำการ Login (จำชื่อ/เบอร์/แผนก ผ่าน LocalStorage)
* **Form Inputs:**
  * **Reporter Info:** ชื่อ-นามสกุล, แผนก, ช่องทางติดต่อ
  * **Title:** หัวข้อปัญหาแบบย่อ
  * **Description:** รายละเอียดปัญหา
  * **Attachment:** อัปโหลดรูปภาพ หรือกด Ctrl+V วางรูปจาก Clipboard ได้เลย (รองรับ PNG, JPG, GIF ขนาดไม่เกิน 5MB)
  * **Urgency Level:**
    * 🔴 High: ระบบหลักล่ม / ทำงานต่อไม่ได้ทันที
    * 🟡 Medium: ทำงานติดขัด / พอมีทางเลี่ยง
    * 🟢 Low: ขอสิทธิ์ / สอบถาม / งานซ่อมทั่วไป
* **Output:** แสดง Ticket ID หลังบันทึกสำเร็จ (เช่น INC-202610-001) พร้อมสถานะส่ง Teams และ SLA Tracker

### 4.2 ฝั่ง Teams Integration & Admin Workflow
* **Teams Notification:** ยิง Adaptive Card เข้าห้อง Microsoft Teams ของทีม IT ทันทีที่มีเคสใหม่ พร้อมรายละเอียดและรูปภาพ
* **Admin Dashboard (Web UI):**
  * แสดงตาราง Incident ทั้งหมด (สามารถ Filter ตาม Status, Category, Urgency, Department ได้)
  * ค้นหาแบบ Precision Search (กด `/` เพื่อ Focus)
* **Dynamic Category Management & Triage:**
  * แอดมินสามารถเพิ่ม/แก้ไขหมวดหมู่ปัญหาได้ตลอดเวลาผ่านระบบ (Dynamic Categories เช่น Helpdesk, Network, Interface, SAP Basis หรือเพิ่มใหม่ได้)
  * แอดมินสามารถเลือกเปลี่ยนหมวดหมู่ (Triage) ของแต่ละเคสได้
* **Resolution & Close (Clean Text for MCP):**
  * เมื่อปิดเคส แอดมินต้องกรอก Resolution Notes (วิธีกระบวนการแก้ไขปัญหา)
  * ข้อความจะถูก Sanitize เป็น Clean Text ปราศจาก Tag ซับซ้อน เพื่อส่งเข้า MCP Context

---

## 5. Database Schema (Prisma / SQLite)

```prisma
// file: prisma/schema.prisma

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Category {
  id          String     @id @default(cuid())
  name        String     @unique // e.g. "Helpdesk", "Network", "Interface", "SAP Basis"
  slug        String     @unique // e.g. "helpdesk", "network", "interface", "sap"
  description String?
  color       String?    // e.g. "#0284c7"
  isActive    Boolean    @default(true)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  incidents   Incident[]
}

model Incident {
  id           String        @id @default(cuid())
  ticketNo     String        @unique // e.g. INC-202610-001
  reporterName String
  department   String?
  contactInfo  String
  title        String
  description  String
  urgency      String        @default("MEDIUM") // LOW, MEDIUM, HIGH
  categoryId   String?
  categoryRel  Category?     @relation(fields: [categoryId], references: [id])
  category     String?       // เก็บชื่อหมวดหมู่สำหรับ query ไว (e.g. HELPDESK, NETWORK, INTERFACE, SAP)
  status       String        @default("OPEN")   // OPEN, IN_PROGRESS, RESOLVED, CLOSED
  assignedTo   String?
  resolution   String?       // บันทึกวิธีแก้ปัญหา (Clean Text สำคัญสำหรับ AI Context)
  attachments  Attachment[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  closedAt     DateTime?
}

model Attachment {
  id         String   @id @default(cuid())
  incidentId String
  incident   Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  fileUrl    String
  fileType   String
  fileName   String?
  fileSize   Int?
  createdAt  DateTime @default(now())
}
```

---

## 6. Architecture for Future MCP Readiness (ข้อกำหนดสำหรับ AI)

เพื่อความพร้อมสูงสุดเมื่อต้องการต่อยอด **MCP Server (Model Context Protocol)** ในอนาคต ให้สามารถนำข้อมูลไปวิเคราะห์:
1. **Historical Insights & Root Cause Analysis (RCA):** ค้นหาสาเหตุที่แท้จริงจากบันทึกวิธีแก้ปัญหาในอดีต
2. **KPIs & Performance Analytics:** Mean Time to Acknowledge (MTTA), Mean Time to Resolve (MTTR), SLA Compliance
3. **Recurring Case Detection:** จัดกลุ่มเคสที่เกิดขึ้นซ้ำซาก เพื่อแจ้งเตือนเชิงรุก (Proactive Prevention)

ระบบปฏิบัติตามมาตรฐาน:
* **Service Layer Separation:** แยก Data Access / Query ไว้ใน `lib/services/`
* **Clean Text Corpus:** `description` และ `resolution` จัดเก็บเป็น Plain Text ปลอด HTML tags
* **Independent MCP Endpoints:**
  * `GET /api/mcp/v1/context`: สกัด Incident Context พร้อม Clean Corpus
  * `GET /api/mcp/v1/insights`: สรุป Metrics & Recurring Patterns เบื้องต้น
  * `GET /api/mcp/v1/recurring`: วิเคราะห์เคสซ้ำซ้อนจาก keywords และ category

---

## 7. Configuration & Deployment Files

### 7.1 next.config.ts / next.config.js
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // จำเป็นสำหรับการ build บน Docker
};

module.exports = nextConfig;
```

### 7.2 Dockerfile (Node.js 26 Alpine Base)
```dockerfile
FROM node:26-alpine AS base

# 1. Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Build Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npx prisma generate
RUN npm run build

# 3. Production Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir -p .next /app/data /app/public/uploads
RUN chown -R nextjs:nodejs .next /app/data /app/public/uploads

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### 7.3 docker-compose.yml
```yaml
version: '3.8'

services:
  incident-app:
    build: .
    container_name: it-incident-app
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./public/uploads:/app/public/uploads
    environment:
      - DATABASE_URL=file:/app/data/incident.db
      - TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/your-webhook-url
```

---

## 8. Development Roadmap

### Phase 1 (MVP - Current):
* พัฒนาหน้าเว็บรับแจ้งปัญหา (Next.js) + แนบรูป (Drag & Drop + Ctrl+V) + Teams Adaptive Card Webhook
* แผง Admin Operations Triage Dashboard พร้อมระบบ Filter, Search และสถิติ
* หน้าจัดการเคส Incident Detail & MCP Hub
* **Dynamic Category Management:** ให้ Admin เพิ่ม/ปรับหมวดหมู่เคสได้อิสระ
* **MCP Readiness Layer:** แยก Service Layer, Clean Text Sanitization, และเปิด MCP Context / Insights Endpoints
* **Pure Docker Deployment:** รันด้วย Docker Alpine Node 26 + SQLite ไม่พึ่งพา Apache

### Phase 2 (MCP & AI Extension - Future):
* เชื่อมต่อ MCP Server (Node/Python) โดยอิสระเข้ากับ `./data/incident.db` และ `/api/mcp/v1/*`
* เชื่อมต่อ Local LLM (Ollama/vLLM) หรือ Cloud LLM เพื่อทำ Automatic Root Cause Analysis, Recurring Case Grouping และ KPI Predictive Analytics
