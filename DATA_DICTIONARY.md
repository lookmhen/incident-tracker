# 📚 Data Dictionary & Schema Specification
## Project: IT Incident Management System (MCP & AI Ready)
**Version:** 1.4  
**Updated:** November 2026  
**Storage Engine:** SQLite 3 (WAL Mode) via Prisma ORM  
**Location:** `./data/incident.db` (Mapped to `/app/data/incident.db` in Docker)

---

## 1. 🗺 Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    CATEGORY ||--o{ INCIDENT : "classifies"
    INCIDENT ||--o{ ATTACHMENT : "contains (CASCADE)"

    CATEGORY {
        string id PK "cuid()"
        string name UK "Unique Display Name"
        string slug UK "URL/Machine identifier"
        string description "Optional details"
        string color "Hex color code e.g. #0284c7"
        boolean isActive "Active toggle flag"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last updated timestamp"
    }

    INCIDENT {
        string id PK "cuid()"
        string ticketNo UK "Format: INC-YYYYMM-XXX"
        string reporterName "Reporter full name"
        string department "Reporter department"
        string contactInfo "Email / Ext / Phone"
        string title "Short incident summary"
        string description "Clean-text problem details"
        string urgency "LOW | MEDIUM | HIGH"
        string categoryId FK "References Category(id)"
        string category "Denormalized category name"
        string rootCause "Root cause e.g. Human | System | Data"
        string status "OPEN | IN_PROGRESS | ON_HOLD | PENDING_CONFIRM | RESOLVED | CLOSED"
        string assignedTo "Responder name / SME"
        string resolution "Clean-text fix & root cause notes"
        string resolutionType "PERMANENT | WORKAROUND"
        string workaroundNote "Condition / follow-up note for WORKAROUND"
        string resolvedBy "Manager who confirmed closure"
        string relatedTickets "JSON array of referenced ticketNos"
        datetime createdAt "Created timestamp"
        datetime updatedAt "Updated timestamp"
        datetime closedAt "Close/Resolution timestamp"
    }

    ADMIN_USER {
        string id PK "cuid()"
        string username UK "Login identifier (email-first, legacy username supported)"
        string name "Display name"
        string email "User email"
        string role "STAFF | MANAGER"
        string passwordHash "scrypt password hash"
        boolean isActive "Active flag (enforced live per request)"
        datetime createdAt "Created timestamp"
        datetime updatedAt "Last updated timestamp"
    }

    ATTACHMENT {
        string id PK "cuid()"
        string incidentId FK "References Incident(id)"
        string fileUrl "Relative path e.g. /uploads/..."
        string fileType "MIME type e.g. image/png"
        string fileName "Original file name"
        int fileSize "Size in bytes (max 5MB)"
        string kind "REPORT | RESOLUTION"
        datetime createdAt "Upload timestamp"
    }

    INTEGRATION_CONFIG {
        string id PK "cuid()"
        string key UK "teams | smtp | mcp_security | mttr_excluded_tickets | root_cause_options"
        string value "JSON string (AES-256-GCM encrypted secrets)"
        boolean isEnabled "Master toggle flag"
        datetime updatedAt "Last updated timestamp"
        datetime createdAt "Created timestamp"
    }

    NOTIFICATION_LOG {
        string id PK "cuid()"
        string ticketNo "Ticket reference e.g. INC-202610-001"
        string channel "TEAMS | EMAIL | CUSTOM_API"
        string destination "Webhook URL or Recipient Email"
        string status "SUCCESS | FAILED"
        int statusCode "HTTP/SMTP status code"
        string payload "Sent payload summary"
        string response "Target server response"
        string errorMessage "Error details if failed"
        datetime createdAt "Dispatch timestamp"
    }
```

---

## 2. 🗄 Database Tables Specification

### 2.1 Table: `Category`
ตารางจัดเก็บหมวดหมู่ของปัญหา (IT Problem Domains) ซึ่งออกแบบให้เป็น **Dynamic Categories** แอดมินสามารถเพิ่ม ลบ หรือแก้ไขได้ตลอดเวลาผ่านหน้า Admin โดยไม่ต้องแก้ไขโค้ด

| Field Name | Type | Nullable | Default | Constraints | Description & Business Rules |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `id` | String | NO | `cuid()` | Primary Key | รหัสเฉพาะประจำ Category (ความยาว ~25-30 ตัวอักษร) |
| `name` | String | NO | - | Unique | ชื่อหมวดหมู่ที่แสดงผล เช่น `SAP Basis`, `Network`, `Helpdesk` |
| `slug` | String | NO | - | Unique | Identifier ภาษาอังกฤษพิมพ์เล็ก เช่น `sap-basis`, `network` |
| `description`| String | YES | `NULL` | - | คำอธิบายขอบเขตของหมวดหมู่เพื่อช่วยในการ Triage |
| `color` | String | YES | `#0284c7` | Hex format | สีประจำหมวดหมู่สำหรับแสดงบน Badge/Pill ใน UI |
| `isActive` | Boolean| NO | `true` | - | สถานะเปิด/ปิดการใช้งาน (`true` = แสดงใน Dropdown) |
| `createdAt`| DateTime| NO | `now()` | - | วันและเวลาที่สร้างหมวดหมู่นี้ |
| `updatedAt`| DateTime| NO | - | Auto-update | วันและเวลาที่มีการแก้ไขข้อมูลล่าสุด |

---

### 2.2 Table: `Incident`
ตารางหลักที่ใช้จัดเก็บข้อมูลคำร้องเรียนและปัญหา IT ทั้งหมด ออกแบบให้รองรับทั้งกระบวนการปฏิบัติงานทั่วไป และรองรับการทำ Data Ingestion สำหรับ MCP (Model Context Protocol) และ Vector Embeddings

| Field Name | Type | Nullable | Default | Constraints | Description & Allowed Values |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `id` | String | NO | `cuid()` | Primary Key | รหัสเฉพาะภายในระบบ (Internal UUID/CUID) |
| `ticketNo` | String | NO | - | Unique, Indexed | **หมายเลข Ticket สาธารณะ** ในรูปแบบ `INC-YYYYMM-XXX`<br>• `YYYYMM`: ปี ค.ศ. และเดือนที่แจ้งเคส เช่น `202610`<br>• `XXX`: Running sequence เริ่มจาก `001` ในแต่ละเดือน |
| `reporterName` | String | NO | - | - | ชื่อ-นามสกุลของผู้แจ้งปัญหา (มาจากฟอร์มหรือ LocalStorage) |
| `department` | String | YES | `NULL` | - | แผนกหรือฝ่ายของผู้แจ้ง เช่น `Finance & Accounting`, `Infra Operations` |
| `contactInfo` | String | NO | - | - | ข้อมูลติดต่อกลับ เช่น อีเมล, เบอร์ต่อภายใน (`Ext. 4412`) |
| `title` | String | NO | - | - | หัวข้อสรุปของปัญหาแบบสั้นกระชับ (Clean Text) |
| `description` | String | NO | - | - | รายละเอียดปัญหา ข้อความ Error ที่พบ (Clean Text ปลอด HTML tags) |
| `urgency` | String | NO | `MEDIUM` | Indexed | ระดับความเร่งด่วนของเคส มี 3 ค่า:<br>• `HIGH`: งานหยุดชะงัก / ระบบหลักล่ม (SLA: 15-30 นาที)<br>• `MEDIUM`: งานติดขัดแต่พอมีทางเลี่ยง (Default)<br>• `LOW`: งานซ่อมทั่วไป / คำถาม / ขอสิทธิ์ |
| `categoryId` | String | YES | `NULL` | Foreign Key | อ้างอิงถึง `Category(id)` สำหรับการ Triage เชิงโครงสร้าง |
| `category` | String | YES | `NULL` | Indexed | Denormalized Category Name เก็บเป็นข้อความไว้เพื่อความรวดเร็วในการ Query และ Filter |
| `rootCause` | String | YES | `NULL` | - | สาเหตุต้นตอของปัญหา (Root Cause Category) เช่น `Human`, `System`, `Data` หรือค่าที่ Admin เพิ่มเอง (**บังคับระบุคู่กับ `category` ก่อนปิดเคส**) |
| `status` | String | NO | `OPEN` | Indexed | สถานะการดำเนินงานของ Ticket (Workflow-Driven ใน UI) มี 6 ค่า:<br>• `OPEN`: เคสใหม่ ยังไม่มีผู้รับผิดชอบ (กด `Claim Ticket` เพื่อเริ่มงาน)<br>• `IN_PROGRESS`: กำลังดำเนินการแก้ไข<br>• `ON_HOLD`: พักรอ Solution (ยกเว้นจากคิวค้าง Backlog Aging และ auto-exclude จาก MTTR)<br>• `PENDING_CONFIRM`: Staff ส่งให้ Manager ตรวจสอบยืนยันปิดเคส (บังคับ Claim + Category + Root Cause)<br>• `RESOLVED`: Manager ยืนยันปิดเคสแล้ว (ล็อกการแก้ไขหัวข้อ/รายละเอียด; เฉพาะ Manager กด `Reopen` ได้)<br>• `CLOSED`: สถานะปิดเคสเดิม (รองรับย้อนหลังเทียบเท่า `RESOLVED`) |
| `assignedTo` | String | YES | `NULL` | - | ชื่อเจ้าหน้าที่ IT หรือระบบอัตโนมัติที่รับผิดชอบเคส เช่น `K. Anan`, `MCP Bot (Auto)` |
| `resolution` | String | YES | `NULL` | - | **บันทึกขั้นตอนและวิธีการแก้ไขปัญหา (Root Cause & Fix)**<br>⚠️ สำคัญมากสำหรับ MCP AI ต้องเป็น **Clean Text** (ห้ามใส่สัญลักษณ์ Markdown ซับซ้อน หรือ HTML tags) |
| `resolutionType` | String | YES | `NULL` | - | ประเภทการปิดเคส: `PERMANENT` (แก้ไขถาวร) หรือ `WORKAROUND` (แก้ไขชั่วคราว/มีเงื่อนไข — หยุดเวลา MTTR พร้อมแสดง Badge) |
| `workaroundNote` | String | YES | `NULL` | - | เงื่อนไขหรือแผนติดตามผลเมื่อปิดเคสแบบ `WORKAROUND` (ล้างเป็น `NULL` เมื่อเปลี่ยนเป็น `PERMANENT`) |
| `resolvedBy` | String | YES | `NULL` | - | ชื่อ Manager ที่ยืนยันปิดเคส |
| `relatedTickets` | String | YES | `NULL` | - | JSON Array ของเลข Ticket เก่าที่อ้างอิง เช่น `["INC-202611-001","INC-202611-005"]` (รองรับหลายเคสและแสดงลิงก์ย้อนกลับ `referencedBy`) |
| `createdAt` | DateTime| NO | `now()` | Indexed | วันที่และเวลาที่เปิดเคส (ใช้คำนวณ Ticket Age และ MTTA) |
| `updatedAt` | DateTime| NO | - | Auto-update | วันที่และเวลาที่มีการปรับปรุงข้อมูล Ticket ล่าสุด |
| `closedAt` | DateTime| YES | `NULL` | - | วันที่และเวลาที่เคสเปลี่ยนสถานะเป็น RESOLVED/CLOSED (ใช้คำนวณ MTTR; ถูกล้างเมื่อ Manager กด Reopen) |

---

### 2.3 Table: `Attachment`
ตารางจัดเก็บไฟล์รูปภาพ Screenshot หรือหลักฐานปิดงานที่แนบมากับ Ticket

| Field Name | Type | Nullable | Default | Constraints | Description & Storage Details |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `id` | String | NO | `cuid()` | Primary Key | รหัสเฉพาะของ Attachment |
| `incidentId`| String | NO | - | Foreign Key | อ้างอิงถึง `Incident(id)` มีเงื่อนไข `ON DELETE CASCADE` (หากลบเคส ไฟล์ที่ผูกไว้จะถูกลบด้วย) |
| `fileUrl` | String | NO | - | - | URL Path สำหรับเข้าถึงไฟล์ เช่น `/uploads/1730894042_sap_dump.png` |
| `fileType` | String | NO | - | - | MIME Type ของไฟล์ เช่น `image/png`, `image/jpeg`, `image/gif` |
| `fileName` | String | YES | `NULL` | - | ชื่อไฟล์เดิมของผู้ใช้งาน |
| `fileSize` | Int | YES | `NULL` | - | ขนาดของไฟล์ในหน่วย Bytes (จำกัดขนาดสูงสุดไม่เกิน 5,242,880 Bytes หรือ 5MB) |
| `kind` | String | NO | `REPORT` | - | ประเภทไฟล์แนบ: `REPORT` (รูปอาการจากฝั่งผู้แจ้ง) หรือ `RESOLUTION` (รูปหลักฐานปิดงาน) |
| `createdAt`| DateTime| NO | `now()` | - | วันและเวลาที่อัปโหลดไฟล์ |

---

### 2.4 Table: `AdminUser`
ตารางบัญชีผู้ใช้ฝั่ง IT Operations สำหรับระบบสิทธิ์ RBAC (`STAFF` / `MANAGER`) และการยืนยันตัวตนแบบ Email-first (รองรับการเปิดบัญชีผ่านลิงก์ Invite ที่มีอายุ 48 ชม.)

| Field Name | Type | Nullable | Default | Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `id` | String | NO | `cuid()` | Primary Key | รหัสเฉพาะของผู้ใช้ |
| `username` | String | NO | - | Unique | รหัสเข้าสู่ระบบ (ผู้ใช้ใหม่เก็บเป็น `email` ตัวพิมพ์เล็ก; รองรับ username เดิมย้อนหลัง) |
| `name` | String | NO | - | - | ชื่อที่แสดงในเคส (`assignedTo`, `resolvedBy`) |
| `email` | String | YES | `NULL` | - | อีเมลสำหรับล็อกอินและรับแจ้งเตือน `PENDING_CONFIRM` (สำหรับ Manager) |
| `role` | String | NO | `STAFF` | - | สิทธิ์การใช้งาน: `STAFF` (รับ/แก้/พัก/ส่งยืนยันเคส) หรือ `MANAGER` (ยืนยันปิดเคส, Reopen, จัดการผู้ใช้) |
| `passwordHash` | String | NO | - | - | รหัสผ่านแบบ `scrypt` salted hash |
| `isActive` | Boolean | NO | `true` | - | สถานะบัญชี (ตรวจสอบสดทุก Request ผ่าน `getActiveSession`) |
| `createdAt` | DateTime | NO | `now()` | - | วันเวลาที่สร้างบัญชี |
| `updatedAt` | DateTime | NO | - | Auto-update | วันเวลาที่แก้ไขล่าสุด |

---

### 2.5 Table: `IntegrationConfig`
ตารางจัดเก็บการตั้งค่าระบบเชื่อมต่อภายนอกและรหัสความปลอดภัย (ข้อมูลลับ เช่น รหัสผ่าน SMTP, Webhook URL และ API Key ถูกเข้ารหัสด้วย **AES-256-GCM** ในรูปแบบ `enc:v1:<iv>:<authTag>:<cipher>` ก่อนบันทึกเสมอ)

| Field Name | Type | Nullable | Default | Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `id` | String | NO | `cuid()` | Primary Key | รหัสเฉพาะของรายการตั้งค่า |
| `key` | String | NO | - | Unique | ชื่อหมวดการตั้งค่า/ออบเจกต์ระบบ: `teams`, `smtp`, `mcp_security`, `mttr_excluded_tickets`, `root_cause_options` |
| `value` | String | NO | - | JSON String | ข้อมูลคอนฟิกแบบ JSON ที่เข้ารหัสฟิลด์ความลับด้วย AES-256-GCM |
| `isEnabled` | Boolean| NO | `true` | - | สวิตช์เปิด/ปิดการทำงานของโมดูลนั้นๆ |
| `updatedAt` | DateTime| NO | - | Auto-update | วันเวลาที่แก้ไขล่าสุด |
| `createdAt` | DateTime| NO | `now()` | - | วันเวลาที่สร้าง |

---

### 2.6 Table: `NotificationLog`
ตารางบันทึกประวัติการส่งแจ้งเตือนขาออกทุกช่องทาง (Teams Webhook, SMTP Email, Custom Event API) พร้อมรองรับการกดส่งซ้ำ (Resend) — **Auto-prune ลบรายการที่เก่ากว่า 14 วันอัตโนมัติ** ทุกครั้งที่บันทึก log ใหม่ (`IntegrationService.LOG_RETENTION_DAYS = 14`)

| Field Name | Type | Nullable | Default | Constraints | Description |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `id` | String | NO | `cuid()` | Primary Key | รหัสเฉพาะของ Log |
| `ticketNo` | String | YES | `NULL` | Indexed | หมายเลข Ticket อ้างอิง |
| `channel` | String | NO | - | Indexed | ช่องทาง: `TEAMS`, `EMAIL`, `CUSTOM_API` |
| `destination`| String | NO | - | - | ปลายทาง (Webhook URL หรือรายชื่ออีเมลผู้รับ) |
| `status` | String | NO | - | Indexed | สถานะการส่ง: `SUCCESS`, `FAILED` |
| `statusCode` | Int | YES | `NULL` | - | รหัสตอบกลับ HTTP/SMTP เช่น `200`, `202`, `250`, `500` |
| `payload` | String | YES | `NULL` | - | ข้อมูล JSON หรือสรุปเนื้อหาที่ส่งออก |
| `response` | String | YES | `NULL` | - | ข้อความตอบกลับจากเซิร์ฟเวอร์ปลายทาง |
| `errorMessage`| String | YES | `NULL` | - | รายละเอียดข้อผิดพลาดกรณีส่งไม่สำเร็จ |
| `createdAt` | DateTime| NO | `now()` | Indexed | วันและเวลาที่ส่งแจ้งเตือน |

---

### 2.7 Incident Status State Machine & Workflow Transitions
หน้า Incident Detail (`/admin/incidents/[id]`) บังคับเปลี่ยนสถานะผ่านปุ่มตามขั้นตอนงาน (ไม่มี dropdown สลับสถานะอิสระ) โดย Backend (`IncidentService.updateIncident` และ `PATCH /api/incidents/[id]`) บังคับสิทธิ์และเงื่อนไขควบคู่กัน:

```mermaid
stateDiagram-v2
    [*] --> OPEN: User Report / Inbound API
    OPEN --> IN_PROGRESS: Claim Ticket (Staff / Manager)
    IN_PROGRESS --> ON_HOLD: พักเคส On Hold (Staff / Manager)
    ON_HOLD --> IN_PROGRESS: กลับมาทำต่อ Resume (Staff / Manager)
    IN_PROGRESS --> PENDING_CONFIRM: ส่งให้ Manager ยืนยัน (Staff)
    ON_HOLD --> PENDING_CONFIRM: ส่งให้ Manager ยืนยัน (Staff)
    PENDING_CONFIRM --> IN_PROGRESS: ตีกลับแก้ไข (Manager)
    PENDING_CONFIRM --> RESOLVED: Confirm & Mark Resolved (Manager)
    IN_PROGRESS --> RESOLVED: Confirm & Mark Resolved (Manager)
    ON_HOLD --> RESOLVED: Confirm & Mark Resolved (Manager)
    RESOLVED --> IN_PROGRESS: เปิดเคสใหม่ Reopen (Manager)
    CLOSED --> IN_PROGRESS: เปิดเคสใหม่ Reopen (Manager, Legacy)
```

| From → To | UI Action | Role | Guards / Validation | Side Effects |
| :--- | :--- | :--- | :--- | :--- |
| `[*] → OPEN` | User Portal / Inbound API | Public / API Key | Required fields | ออกเลข `ticketNo` (retry P2002), ส่ง Teams + Email |
| `OPEN → IN_PROGRESS` | `Claim Ticket (รับเคส)` | Staff, Manager | - | ตั้ง `assignedTo = currentUser`, เริ่มทำงาน |
| `IN_PROGRESS → ON_HOLD` | `พักเคส (On Hold)` | Staff, Manager | - | Auto-set `mttrExcluded = true`, ยกเว้นจาก Backlog Aging |
| `ON_HOLD → IN_PROGRESS` | `กลับมาทำต่อ (Resume)` | Staff, Manager | - | กลับเข้าคิว Active (`mttrExcluded` คงค่าเดิมจนกว่าจะสลับเอง) |
| `IN_PROGRESS / ON_HOLD → PENDING_CONFIRM` | `ส่งให้ Manager ยืนยันปิดเคส` | Staff | ต้อง Claim แล้ว (`assignedTo` ไม่ว่างและไม่ใช่ `OPEN`) + มี `category`, `rootCause` (และ `workaroundNote` ถ้าเลือก Workaround) | ส่ง Email แจ้ง Manager (เฉพาะครั้งแรกที่เข้า `PENDING_CONFIRM`), ปุ่มสีเทากันส่งซ้ำ |
| `PENDING_CONFIRM → IN_PROGRESS` | `ตีกลับแก้ไข (In Progress)` | Manager | - | ส่งเคสกลับให้ทีมแก้ไขต่อ |
| `IN_PROGRESS / ON_HOLD / PENDING_CONFIRM → RESOLVED` | `Confirm & Mark Resolved` | **Manager เท่านั้น** (`403` ถ้า Staff) | Claim แล้ว (UI) + `category`, `rootCause` (และ `workaroundNote` ถ้าเลือก Workaround) | ตั้ง `closedAt = now` (หยุด MTTR), บันทึก `resolvedBy`, ตั้ง `resolutionType` (`PERMANENT`/`WORKAROUND`), **ล็อกการแก้ไขข้อมูล/รูปแนบทั้งหมดแบบ One-way ทั้ง Staff และ Manager** (ยกเว้น Manager ปรับ `closedAt` / `mttrExcluded` หรือกด `Reopen`) |
| `RESOLVED / CLOSED → IN_PROGRESS` | `เปิดเคสใหม่ (Reopen)` | **Manager เท่านั้น** (`403` ถ้า Staff) | `window.confirm` ใน UI | ล้าง `closedAt = null`, ปลดล็อกให้กลับมาแก้ไขข้อมูลเคสและรูปแนบได้ |

> **หมายเหตุเพิ่มเติม:**
> - **One-way Closed Lock:** เมื่อเคสเป็น `RESOLVED`/`CLOSED` จะล็อกการแก้ไขข้อมูลทั้งหมด (ชื่อ/แผนก/ติดต่อ, หัวข้อ/รายละเอียด, Resolution, Category, Root Cause, Re-assign, รูปแนบ, Related Incidents) สำหรับทั้ง Staff และ Manager (Backend ปฏิเสธด้วย `400`/`403`) — Manager ต้องกด **`เปิดเคสใหม่ (Reopen)`** กลับเป็น `IN_PROGRESS` ก่อนจึงจะแก้ได้ ยกเว้นเฉพาะ **`closedAt`** และ **`mttrExcluded`** ที่ Manager ยังปรับหลังปิดเคสได้
> - **Re-assign (`Assigned: ...`)** บนเคสที่ยังไม่ปิด (`IN_PROGRESS`, `ON_HOLD`, `PENDING_CONFIRM`) จะอัปเดตเฉพาะ `assignedTo` โดย **ไม่เปลี่ยน `status` เดิม**
> - **Legacy `CLOSED`:** UI ใหม่ปิดเคสเป็น `RESOLVED` เสมอ แต่ Backend, Analytics และ Export ยังคงรองรับเคสเก่าที่เป็น `CLOSED` เทียบเท่า `RESOLVED` และ Manager สามารถกด `Reopen` ได้เช่นเดียวกัน
> - **Spec อ้างอิง:** [`docs/superpowers/specs/2026-11-20-workflow-driven-status-design.md`](docs/superpowers/specs/2026-11-20-workflow-driven-status-design.md)

---

## 3. 🤖 Model Context Protocol (MCP) Data Schema

สำหรับส่งมอบข้อมูลให้ External MCP Client / Autonomous Agent ระบบได้กำหนด Schema มาตรฐานกลาง `mcp.incident.v1` (ไม่ผูกติดกับค่ายหรือยี่ห้อ AI ใดๆ):

```json
{
  "mcp_resource_uri": "mcp://incidenthub/incidents/INC-202610-001",
  "ticketNo": "INC-202610-001",
  "app_domain": "SAP Basis",
  "root_cause": "System",
  "severity": "P1_CRITICAL",
  "status": "OPEN",
  "vectors_ready": true,
  "clean_text_corpus": "Title: SAP S/4HANA GUI error 'RFC_COMMUNICATION_FAILURE' during Month-End closing Description: Executing batch reconciliation transaction F.05 against company code 1020. Program hung for ~4 minutes before terminating with dump 'RFC_COMMUNICATION_FAILURE'. Network connection verified stable. Affected 4 users in Finance AP. Resolution: Killed hanging job in SM50, restarted RFC connection in SM59, verified connectivity test. Actionable Prevention: Configured RFC buffer limits in SAP profile parameter rfc/max_conn.",
  "reporter_context": {
    "department": "Finance & Accounting",
    "reported_at": "2026-10-26T14:14:22.000Z",
    "closed_at": null
  }
}
```

### 🧹 Clean Text Sanitization Rules:
1. ตัด HTML Tags ทั้งหมด (`<...>` ➔ ถูกแทนที่ด้วยช่องว่าง)
2. ตัด Markdown Links (`[text](url)` ➔ เหลือเพียง `text`)
3. ตัด Formatting Characters (`*`, `#`, `_`, `~`, `` ` ``)
4. ยุบช่องว่างและบรรทัดว่างเกินความจำเป็น (Multiple spaces/newlines ➔ Single space)

---

## 4. 🌐 API Endpoints & Data Contracts

| Method | Endpoint | Request Payload / Params | Response Summary |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/incidents` | `search`, `status`, `urgency`, `category`, `department`, `page`, `limit` | รายการเคสแบบ Paginated พร้อมสถิติ KPI รวม |
| **POST** | `/api/incidents` | `multipart/form-data` หรือ JSON: `reporterName`, `department`, `contactInfo`, `title`, `description`, `urgency`, `attachment` | Incident Object ที่ถูกสร้างใหม่พร้อม Ticket ID |
| **GET** | `/api/incidents/[id]` | `id` หรือ `ticketNo` | รายละเอียดเคสพร้อม Attachments และ Category Relation |
| **PATCH** | `/api/incidents/[id]` | JSON: `{ reporterName?, department?, contactInfo?, status?, category?, rootCause?, urgency?, assignedTo?, resolution?, resolutionType?, workaroundNote?, relatedTickets?, createdAt?, closedAt?, mttrExcluded? }` (รองรับ `x-api-key`) | Incident Object ที่อัปเดตแล้ว (บังคับ Claim ก่อน `PENDING_CONFIRM`, บังคับ `category`+`rootCause` ก่อนส่ง/ปิดเคส, และจำกัดสิทธิ์ปิด/Reopen เฉพาะ `MANAGER`) |
| **POST/DELETE** | `/api/incidents/[id]/attachments` | `multipart/form-data` (`file`, `kind: REPORT\|RESOLUTION`) หรือ `?attachmentId=` | อัปโหลด/ลบรูปแนบแยกฝั่งผู้แจ้งและหลักฐานปิดงาน |
| **GET** | `/api/incidents/export` | `search`, `status`, `urgency`, `category`, `rootCause`, `department`, `startDate`, `endDate` | ไฟล์ `.csv` เข้ารหัส UTF-8 with BOM สำหรับเปิดใน Excel |
| **GET** | `/api/incidents/analytics` | `startDate`, `endDate`, `groupBy`, `urgency`, `category`, `rootCause`, `department` | ข้อมูลสรุป Analytics (Created vs Resolved, Category, Root Cause, Department, Status/SLA, MTTR Breakdown, Backlog Aging) |
| **GET** | `/api/categories` | - | รายชื่อ Categories ทั้งหมด เรียงตามชื่อ |
| **POST** | `/api/categories` | JSON: `{ name, description?, color?, slug? }` | Category Object ที่สร้างใหม่ |
| **DELETE**| `/api/categories/[id]` | `id` | `{ success: true }` |
| **GET/POST/DELETE** | `/api/root-causes` | JSON `{ name }` (POST) หรือ `?name=` (DELETE) | จัดการตัวเลือก Root Cause (`Human`, `System`, `Data` และรายการที่เพิ่มเอง) |
| **GET** | `/api/departments` | `?q=` (optional, public) | รายชื่อแผนกทั้งหมดที่มีในระบบแบบ deduplicate (ไม่สนตัวพิมพ์เล็ก-ใหญ่) สำหรับ autocomplete |
| **GET** | `/api/uploads/[filename]` | `filename` (rewrite จาก `/uploads/:filename`) | อ่านไฟล์แนบจาก `public/uploads` ในโหมด standalone พร้อมตรวจ path traversal |
| **GET** | `/api/mcp/v1/context` | `?ticketNo=INC-XXX` (รองรับ Header `x-api-key`) | Clean MCP Schema JSON สำหรับ External MCP Client |
| **GET** | `/api/mcp/v1/insights` | รองรับ Header `x-api-key` | ข้อมูลสรุปภาพรวม KPI, MTTA, MTTR และ Category Load |
| **GET** | `/api/mcp/v1/recurring`| รองรับ Header `x-api-key` | การจัดกลุ่มเคสที่เกิดซ้ำซ้อน (Clustering by Patterns) |
| **POST** | `/api/events/notify` | JSON: `{ detail, urgency, incident_type, webhookUrl? }` (รองรับ `x-api-key`) | ส่งแจ้งเตือนไปยัง Webhook ปลายทางพร้อมบันทึก Log |
| **GET** | `/api/incidents/inbound` | - | ข้อมูล Documentation และตัวอย่าง Payload สำหรับ Inbound Incident API |
| **POST** | `/api/incidents/inbound` | JSON (Smart Mapping): `{ title/summary, description/detail, urgency/severity?, reporterName/sourceSystem?, department?, category? }` (รองรับ `x-api-key`) | รับแจ้ง Incident จากระบบภายนอก (Zabbix, Grafana, ERP) บันทึกลง SQLite ออกเลข Ticket อัตโนมัติ และยิง Teams/Email |
| **GET/PUT/POST** | `/api/integrations` | Admin Session Cookie | ดึง/บันทึกการตั้งค่า Teams, SMTP, MCP Security และหมุนเปลี่ยน API Key |
| **GET/POST** | `/api/integrations/logs` | Admin Session Cookie | ดึงประวัติการส่งแจ้งเตือนและสั่งส่งซ้ำ (Resend) |
| **POST/DELETE/GET** | `/api/auth/admin` | JSON: `{ identifier/email/username, password }` หรือ `{ passcode }` | เข้าสู่ระบบ/ออกจากระบบ Admin Console ด้วย HTTP-Only Signed Cookie (ตรวจสิทธิ์ `AdminUser` สดทุก Request) |
| **GET/POST** | `/api/users` | JSON: `{ email, name, role, password }` (เฉพาะ `MANAGER`) | รายชื่อและสร้างผู้ใช้ Admin ใหม่ |
| **PATCH/DELETE** | `/api/users/[id]` | JSON: `{ name?, email?, role?, isActive?, password? }` (เฉพาะ `MANAGER`) | แก้ไขสิทธิ์/สถานะ/รหัสผ่าน หรือลบบัญชีผู้ใช้ |
| **POST/GET** | `/api/users/invite` | JSON: `{ email, name, role, sendEmail? }` (POST, `MANAGER`) หรือ `?token=` (GET) | สร้างและตรวจสอบลิงก์เชิญลงทะเบียน HMAC อายุ 48 ชม. (ใช้ได้ครั้งเดียว) |
| **POST** | `/api/users/invite/accept` | JSON: `{ token, password, name? }` | ยืนยันลิงก์ Invite ตั้งรหัสผ่านและสร้างบัญชี `AdminUser` |
| **POST** | `/api/teams/ping` | - | ส่ง Test Ping ทดสอบ Webhook |

---

## 5. 💾 Client-Side Storage Dictionary (LocalStorage)

เพื่อให้ผู้ใช้งานในองค์กรสามารถส่งเคสได้อย่างสะดวกรวดเร็วโดยไม่ต้องล็อกอิน ระบบบันทึกข้อมูลประจำตัวของผู้แจ้งลงใน Browser LocalStorage:

| Storage Key | Format | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `incidenthub_reporter_identity` | JSON Object String | `{"reporterName":"Somchai Prasert","department":"Finance & Accounting","contactInfo":"somchai.p@company.com / Ext. 4412"}` | บันทึกชื่อ, แผนก, และเบอร์ติดต่อ โดยผู้ใช้สามารถกดแก้ไข (Edit) หรือล้างข้อมูล (Clear) ได้จากหน้าจอ |

---

## 6. 🛠 คำแนะนำสำหรับการปรับปรุงและแก้ไขในอนาคต (Maintenance Guide)

### เมื่อต้องการเพิ่มฟิลด์ใหม่ลงใน Database:
1. แก้ไขไฟล์ [`prisma/schema.prisma`](prisma/schema.prisma)
2. เพิ่มการสร้างคอลัมน์/ตารางแบบ Additive (`ALTER TABLE ... ADD COLUMN` / `CREATE TABLE IF NOT EXISTS`) ใน `ensureSchemaColumns()` ที่ [`src/lib/prisma.ts`](src/lib/prisma.ts) เพื่อให้ Docker production อัปเกรดฐานข้อมูล SQLite เดิมได้โดยไม่ต้องรัน CLI
3. รันคำสั่งอัปเดต Schema และ Prisma Client บนเครื่องพัฒนา:
   ```bash
   npx prisma db push && npx prisma generate
   ```
4. หากมี Type Interface ใน TypeScript ให้เพิ่มฟิลด์ที่เกี่ยวข้องใน:
   - [`src/lib/services/incident.service.ts`](src/lib/services/incident.service.ts)
   - หน้าจอ UI Component ที่เกี่ยวข้อง

### เมื่อต้องการขยายความสามารถของระบบ MCP:
- สามารถดึงข้อมูลผ่าน Endpoint `GET /api/mcp/v1/context` (พร้อมแนบ Header `x-api-key` เมื่อเปิดโหมดบังคับใช้ความปลอดภัย) หรือเชื่อมต่อ MCP Server ภายนอกมาอ่านไฟล์ SQLite ที่ `./data/incident.db` โดยตรงได้แบบ Read-Only
- ข้อมูลฟิลด์ `resolution` ถูกออกแบบให้เป็น Clean Text เสมอ จึงสามารถนำไปแปลงเป็น Vector Embeddings ด้วยโมเดลใดก็ได้ทันทีโดยไม่ต้องผ่านกระบวนการ Data Cleaning ซ้ำ
