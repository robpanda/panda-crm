import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm"
    }
  }
});

async function main() {
  try {
    // Count photos with tags
    const photosWithTags = await prisma.companyCamPhoto.count({
      where: {
        tags: {
          isEmpty: false
        }
      }
    });
    console.log('Photos with tags:', photosWithTags);

    // Count photos without tags
    const photosWithoutTags = await prisma.companyCamPhoto.count({
      where: {
        tags: {
          isEmpty: true
        }
      }
    });
    console.log('Photos without tags:', photosWithoutTags);

    // Sample photos (check tags array)
    const samplePhotos = await prisma.companyCamPhoto.findMany({
      select: {
        id: true,
        companyCamId: true,
        tags: true
      },
      take: 5
    });
    console.log('\nSample photos (tags):');
    samplePhotos.forEach(p => {
      console.log(`  ${p.id}: tags = ${JSON.stringify(p.tags)}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
