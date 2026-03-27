#!/bin/bash

# CompreFace Setup Script for CourtFlow
echo "Setting up CompreFace for CourtFlow face recognition..."

# Create docker directory if it doesn't exist
mkdir -p docker

# Start CompreFace services
echo "Starting CompreFace Docker containers..."
docker compose -f docker/compreface.yml up -d

# Wait for services to be ready
echo "Waiting for CompreFace to start..."
sleep 30

# Check if CompreFace is running
if curl -f http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "✅ CompreFace is running successfully!"
    echo "📋 CompreFace UI is available at: http://localhost:8000"
    echo "🔧 API endpoint: http://localhost:8000/api/v1"
else
    echo "❌ CompreFace failed to start. Check docker logs:"
    docker compose -f docker/compreface.yml logs
    exit 1
fi

# Create face collection for CourtFlow
echo "Creating CourtFlow face collection..."
API_KEY="your-api-key-here"
COLLECTION_NAME="courtflow_players"

# Try to create collection (will fail if already exists, which is fine)
curl -X POST "http://localhost:8000/api/v1/face-collection" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$COLLECTION_NAME\"}" \
  --fail --silent --show-error || echo "Collection may already exist"

echo "✅ Face collection '$COLLECTION_NAME' is ready"
echo ""
echo "🎉 CompreFace setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update your .env file with:"
echo "   COMPREFACE_API_URL=http://localhost:8000/api/v1"
echo "   COMPREFACE_API_KEY=your-api-key-here"
echo "   COMPREFACE_COLLECTION_NAME=courtflow_players"
echo ""
echo "2. Visit http://localhost:8000 to configure CompreFace UI"
echo "3. Test the API with: curl http://localhost:8000/api/v1/health"
