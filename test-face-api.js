const { mockFaceRecognitionService } = require('./src/lib/face-recognition-mock.ts');

async function testFaceRecognitionAPI() {
  try {
    console.log('🧪 Testing Face Recognition API...\n');
    
    // Test with a sample image
    const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    
    console.log('1. Testing face recognition with sample image...');
    const result = await mockFaceRecognitionService.recognizeFace(testImage);
    
    console.log('Recognition Result:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n2. Checking if your specific face is in the mock service...');
    const stats = mockFaceRecognitionService.getStats();
    console.log('Mock service stats:', stats);
    
    console.log('\n3. Testing multiple times to see match patterns...');
    for (let i = 0; i < 5; i++) {
      const testResult = await mockFaceRecognitionService.recognizeFace(testImage);
      console.log(`Test ${i + 1}: ${testResult.resultType} - ${testResult.displayName || 'New Player'}`);
    }
    
    console.log('\n4. Expected behavior for your face (+6694246378):');
    console.log('- Should have 85% chance of being matched');
    console.log('- Should return "matched" resultType with your name');
    console.log('- Confidence should be 85-99%');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testFaceRecognitionAPI();
