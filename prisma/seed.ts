import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding IT Incident Management System database...');

  // 1. Seed Dynamic Categories
  const categories = [
    {
      name: 'SAP Basis',
      slug: 'sap-basis',
      description: 'SAP S/4HANA ERP, RFC gateways, and ABAP instances',
      color: '#0284c7',
    },
    {
      name: 'Network',
      slug: 'network',
      description: 'Core routing, VPN, firewalls, and ExpressRoute',
      color: '#0369a1',
    },
    {
      name: 'Interface',
      slug: 'interface',
      description: 'APIs, webhooks, middleware, and message queues',
      color: '#0ea5e9',
    },
    {
      name: 'Helpdesk',
      slug: 'helpdesk',
      description: 'End-user workstation, MDM, authentication, and software support',
      color: '#38bdf8',
    },
  ];

  const categoryMap: Record<string, string> = {};

  for (const cat of categories) {
    const upserted = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
    categoryMap[cat.name] = upserted.id;
  }

  console.log(`Seeded ${Object.keys(categoryMap).length} categories.`);

  // 2. Seed Mock Incidents matching Dashboard
  const now = new Date();
  const m18 = new Date(now.getTime() - 18 * 60 * 1000);
  const m42 = new Date(now.getTime() - 42 * 60 * 1000);
  const h1 = new Date(now.getTime() - 60 * 60 * 1000);
  const h2 = new Date(now.getTime() - 120 * 60 * 1000);

  const incidents = [
    {
      ticketNo: 'INC-202610-001',
      reporterName: 'Somchai Prasert',
      department: 'Finance & Accounting',
      contactInfo: 'somchai.p@company.com / Ext. 4412',
      title: "SAP S/4HANA GUI error 'RFC_COMMUNICATION_FAILURE' during Month-End closing",
      description:
        "Executing batch reconciliation transaction F.05 against company code 1020. Program hung for ~4 minutes before terminating with dump 'RFC_COMMUNICATION_FAILURE'. Network connection verified stable. Affected 4 users in Finance AP.",
      urgency: 'HIGH',
      category: 'SAP Basis',
      categoryId: categoryMap['SAP Basis'],
      status: 'OPEN',
      assignedTo: 'K. Anan',
      createdAt: now,
      attachments: {
        create: [
          {
            fileName: 'sap_error_dump_0918.png',
            fileUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80',
            fileType: 'image/png',
            fileSize: 1420000,
          },
        ],
      },
    },
    {
      ticketNo: 'INC-202610-002',
      reporterName: 'Chatchai K.',
      department: 'Infra Operations',
      contactInfo: 'chatchai.k@company.com / Ext. 2108',
      title: 'Rayong Gateway Core BGP flapping with Azure ExpressRoute',
      description:
        'Rayong DC Gateway Router BGP session to Azure Southeast Asia flapping intermittently every 3 minutes. Packet loss observed on SAP ERP replication channel.',
      urgency: 'HIGH',
      category: 'Network',
      categoryId: categoryMap['Network'],
      status: 'IN_PROGRESS',
      assignedTo: 'S. Kittisak',
      createdAt: m18,
    },
    {
      ticketNo: 'INC-202610-003',
      reporterName: 'Pornpimol T.',
      department: 'E-Commerce Platform',
      contactInfo: 'pornpimol.t@company.com / Ext. 3319',
      title: 'Customer Portal Payment Webhook HTTP 504 Gateway Timeout',
      description:
        'Bank payment callback endpoint intermittently timing out with HTTP 504. Ingress controller queue reached 800 pending connections.',
      urgency: 'MEDIUM',
      category: 'Interface',
      categoryId: categoryMap['Interface'],
      status: 'IN_PROGRESS',
      assignedTo: 'W. Rungroj',
      createdAt: m42,
    },
    {
      ticketNo: 'INC-202610-004',
      reporterName: 'David S.',
      department: 'Executive Offices',
      contactInfo: 'david.s@company.com / Ext. 1001',
      title: 'Intune MDM profile failing certificate handshake on macOS Sonoma',
      description:
        'Device enrollment failed during certificate payload verification after macOS 14.5 Sonoma update.',
      urgency: 'MEDIUM',
      category: 'Helpdesk',
      categoryId: categoryMap['Helpdesk'],
      status: 'OPEN',
      assignedTo: null,
      createdAt: h1,
    },
    {
      ticketNo: 'INC-202610-005',
      reporterName: 'Nattawut M.',
      department: 'Inventory Ops',
      contactInfo: 'nattawut.m@company.com / Ext. 5092',
      title: 'User account lock on SAP Client 300 after 3 incorrect credential attempts',
      description:
        'Locked out of inventory transaction MIGO after password expiration on warehouse terminal 04.',
      urgency: 'LOW',
      category: 'SAP Basis',
      categoryId: categoryMap['SAP Basis'],
      status: 'RESOLVED',
      assignedTo: 'MCP Bot (Auto)',
      resolution:
        'Root Cause: User entered expired password 3 consecutive times triggering security lock. Resolution: Reset initial logon password via automated SU01 script and dispatched SMS temporary PIN. Actionable Prevention: Enforced 14-day password expiration warning prompt in SAP GUI.',
      createdAt: h2,
      closedAt: new Date(h2.getTime() + 15 * 60 * 1000),
    },
  ];

  for (const inc of incidents) {
    const { attachments, ...data } = inc;
    await prisma.incident.upsert({
      where: { ticketNo: inc.ticketNo },
      update: data,
      create: inc,
    });
  }

  console.log('Seeded 5 initial incidents successfully.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
