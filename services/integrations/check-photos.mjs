import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function check() {
  const photos = await prisma.companyCamPhoto.findMany({
    where: { migratedToS3: true },
    select: {
      id: true,
      s3Key: true,
      s3ThumbnailKey: true,
    },
    take: 5
  });
  
  console.log('Sample photos with S3 keys:');
  photos.forEach(p => {
    console.log('ID:', p.id);
    console.log('  Full-size:', p.s3Key);
    console.log('  Thumbnail:', p.s3ThumbnailKey);
    const different = p.s3Key !== p.s3ThumbnailKey;
    console.log('  Different?', different);
    console.log('');
  });
  
  await prisma.$disconnect();
}

check();
