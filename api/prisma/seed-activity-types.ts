import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.activityType.upsert({
    where: {
      typeCode: 'gift_collection',
    },
    update: {
      typeName: '礼物收集类',
      aggregationMode: 'daily',
      metricUnit: '个',
      entrySchema: {
        supportsMultipleItems: true,
        fields: ['anchorName', 'operatorId', 'liveDate', 'liveStartTime', 'items', 'attachments'],
      },
    },
    create: {
      typeCode: 'gift_collection',
      typeName: '礼物收集类',
      aggregationMode: 'daily',
      metricUnit: '个',
      entrySchema: {
        supportsMultipleItems: true,
        fields: ['anchorName', 'operatorId', 'liveDate', 'liveStartTime', 'items', 'attachments'],
      },
    },
  })

  await prisma.activityType.upsert({
    where: {
      typeCode: 'pk_score',
    },
    update: {
      typeName: 'PK 值类',
      aggregationMode: 'session',
      metricUnit: 'PK 值',
      entrySchema: {
        supportsMultipleItems: false,
        fields: ['anchorName', 'operatorId', 'liveDate', 'liveStartTime', 'pkValue', 'attachments'],
      },
    },
    create: {
      typeCode: 'pk_score',
      typeName: 'PK 值类',
      aggregationMode: 'session',
      metricUnit: 'PK 值',
      entrySchema: {
        supportsMultipleItems: false,
        fields: ['anchorName', 'operatorId', 'liveDate', 'liveStartTime', 'pkValue', 'attachments'],
      },
    },
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
