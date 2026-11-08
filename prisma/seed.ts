import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding IT Incident Management System categories...');

  // 1. Seed Dynamic Master Categories
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

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
  }

  console.log(`Seeded ${categories.length} production master categories.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
