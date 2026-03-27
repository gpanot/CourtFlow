const https = require('https');

const API_KEY = process.env.COMPREFACE_API_KEY;
const COMPREFACE_URL = process.env.COMPREFACE_API_URL;
const COLLECTION_NAME = 'courtflow_players';

async function setupCollection() {
  try {
    // Create face collection
    const response = await https.post(
      `${COMPREFACE_URL}/face-collection`,
      JSON.stringify({ name: COLLECTION_NAME }),
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      console.log('✅ Face collection created:', data);
    });
  } catch (error) {
    if (error.code === 'EEXIST') {
      console.log('✅ Face collection already exists');
    } else {
      console.error('❌ Error creating collection:', error.message);
    }
  }
}

setupCollection();
