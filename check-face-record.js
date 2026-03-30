const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkFaceRecord() {
  try {
    const phoneNumber = '+6694246378';
    
    console.log(`Checking for player with phone: ${phoneNumber}`);
    
    // Check for player record
    const player = await prisma.player.findUnique({
      where: { phone: phoneNumber },
      include: {
        queueEntries: {
          orderBy: { joinedAt: 'desc' },
          take: 5
        }
      }
    });
    
    if (player) {
      console.log('✅ Player found:');
      console.log(`  ID: ${player.id}`);
      console.log(`  Name: ${player.name}`);
      console.log(`  Phone: ${player.phone}`);
      console.log(`  Face Subject ID: ${player.faceSubjectId || 'NOT SET'}`);
      console.log(`  Created: ${player.createdAt}`);
      console.log(`  Queue Entries: ${player.queueEntries.length}`);
      
      if (player.faceSubjectId) {
        console.log('🎯 Face recognition record EXISTS');
      } else {
        console.log('❌ NO face recognition record found');
      }
    } else {
      console.log('❌ Player NOT found in database');
    }
    
    // Check all players with face records
    const playersWithFaces = await prisma.player.findMany({
      where: {
        faceSubjectId: { not: null }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        faceSubjectId: true,
        createdAt: true
      }
    });
    
    console.log(`\n📊 Total players with face records: ${playersWithFaces.length}`);
    playersWithFaces.forEach(p => {
      console.log(`  ${p.phone} - ${p.name} (${p.faceSubjectId})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFaceRecord();
