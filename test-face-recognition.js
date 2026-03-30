const { mockFaceRecognitionService } = require('./src/lib/face-recognition-mock.ts');

async function testFaceRecognition() {
  try {
    console.log('🔍 Testing face recognition system...\n');
    
    // Test with a sample image (simulating your face)
    const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    
    console.log('1. Testing face recognition...');
    const result = await mockFaceRecognitionService.recognizeFace(testImage);
    
    console.log('Recognition result:', JSON.stringify(result, null, 2));
    
    console.log('\n2. Current mock players in memory:');
    const stats = mockFaceRecognitionService.getStats();
    console.log(JSON.stringify(stats, null, 2));
    
    console.log('\n3. Expected behavior:');
    console.log('- If face matches existing player: should return "matched" with your player ID');
    console.log('- If face is new: should return "new_player"');
    console.log('- The mock service randomly decides 70% chance of returning player');
    
    console.log('\n4. Issue Analysis:');
    if (result.resultType === 'new_player') {
      console.log('❌ ISSUE: Mock service returned "new_player" instead of matching existing player');
      console.log('🔧 This is because the mock service uses RANDOM matching (70% chance)');
      console.log('🔧 It does NOT actually match faces - it just randomly picks from enrolled players');
    } else if (result.resultType === 'matched') {
      console.log('✅ Mock service returned "matched"');
      console.log(`📝 Player ID: ${result.playerId}`);
      console.log(`📝 Display Name: ${result.displayName}`);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testFaceRecognition();
