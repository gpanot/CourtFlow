#!/bin/bash

echo "🚀 Setting up Face Recognition for Production..."

# Generate a secure API key
API_KEY=$(openssl rand -hex 32)
echo "🔐 Generated API Key: $API_KEY"

# Create face collection setup script
cat > setup-collection.js << 'EOF'
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
EOF

echo "📋 Production Setup Instructions:"
echo ""
echo "1. Deploy CompreFace to Railway:"
echo "   - Push railway/compreface/ directory to Railway"
echo "   - Set API_KEY environment variable to: $API_KEY"
echo ""
echo "2. Update CourtFlow environment variables:"
echo "   COMPREFACE_API_URL=https://your-compreface-app.railway.app/api/v1"
echo "   COMPREFACE_API_KEY=$API_KEY"
echo "   COMPREFACE_COLLECTION_NAME=courtflow_players"
echo ""
echo "3. Deploy CourtFlow to Railway"
echo ""
echo "4. Test the face recognition:"
echo "   - Open the staff dashboard"
echo "   - Try 'Capture Face' button"
echo "   - Check browser console for any errors"
echo ""
echo "🔧 API Key for Railway: $API_KEY"
echo ""
echo "⚠️  Save this API key - you'll need it for Railway setup!"
