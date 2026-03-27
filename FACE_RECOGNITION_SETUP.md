# Face Recognition Setup Guide

This guide explains how to set up and use the face recognition feature for CourtFlow.

## Overview

The face recognition system allows players to check in by simply looking at a camera. It includes:
- **Capture Face button** in the Check-in tab for manual face enrollment
- **Face Kiosk tab** for automatic, always-on face recognition
- **Queue numbers** assigned to players (e.g., "James - #4")
- **4-hour duplicate prevention** to avoid multiple check-ins

## Prerequisites

1. Docker installed on your system
2. Camera access on the device running the staff app
3. Active venue and session in CourtFlow

## Setup Instructions

### 1. Start CompreFace

```bash
# Navigate to your CourtFlow directory
cd /path/to/CourtFlow

# Run the setup script
./scripts/setup-compreface.sh
```

Or manually:

```bash
# Start CompreFace services
docker compose -f docker/compreface.yml up -d

# Wait for services to start (about 30 seconds)
sleep 30

# Check if CompreFace is running
curl http://localhost:8000/api/health
```

### 2. Configure Environment Variables

Add these to your `.env` file:

```env
# CompreFace Face Recognition
COMPREFACE_API_URL=http://localhost:8000/api/v1
COMPREFACE_API_KEY=your-api-key-here
COMPREFACE_COLLECTION_NAME=courtflow_players
```

### 3. Access CompreFace UI

1. Open http://localhost:8000 in your browser
2. The default login is:
   - Username: `admin`
   - Password: `admin`
3. Navigate to **Face Collections** → **courtflow_players**
4. The collection should be created automatically by the setup script

### 4. Get API Key

1. In CompreFace UI, go to **Services** → **API Keys**
2. Create a new API key or use the default one
3. Update `COMPREFACE_API_KEY` in your `.env` file

## Usage

### Manual Face Capture (Check-in Tab)

1. Go to the **Check-in** tab in the staff app
2. Fill in player details (name, gender, skill level)
3. Click the **"Capture Face"** button below the form
4. Allow camera access when prompted
5. Position face in the camera frame
6. The system will automatically capture and enroll the face
7. Player is added to queue with a number

### Face Kiosk (Face Tab)

1. Go to the **Face** tab in the staff app
2. Click **"Start Kiosk"** to begin face recognition
3. Position a tablet/phone with camera facing the entrance
4. Players simply look at the camera to check in
5. The system automatically:
   - Detects faces
   - Recognizes returning players
   - Creates new players if needed
   - Assigns queue numbers
   - Prevents duplicate check-ins within 4 hours

## Queue Display

Players in the queue will display as:
- **"John Doe - #4"** for face-checked-in players
- **"Jane Smith"** for manually checked-in players (until they use face recognition)

## API Endpoints

### Kiosk Session Status
```
GET /api/kiosk/session?venueId={venueId}
```

### Process Face
```
POST /api/kiosk/process-face
{
  "venueId": "venue-id",
  "imageBase64": "base64-encoded-image",
  "kioskId": "optional-kiosk-id"
}
```

### Recent Check-ins
```
GET /api/kiosk/recent-checkins?venueId={venueId}&limit=20
```

### Manual Override
```
POST /api/kiosk/manual-resolve
{
  "venueId": "venue-id",
  "attemptId": "attempt-id",
  "action": "select_player" | "create_new",
  "selectedPlayerId": "player-id" // only for select_player
}
```

## Database Schema

### New Fields

**Player table:**
- `faceSubjectId` - Reference to CompreFace subject

**QueueEntry table:**
- `queueNumber` - Session-specific sequential number

### New Tables

**FaceAttempt:**
- Logs all face recognition attempts
- Tracks confidence, results, and host interventions

**KioskDevice:**
- Manages multiple kiosk devices

## Troubleshooting

### CompreFace Not Starting
```bash
# Check Docker logs
docker compose -f docker/compreface.yml logs

# Restart services
docker compose -f docker/compreface.yml restart
```

### Camera Access Issues
1. Ensure HTTPS is used in production (camera requires secure context)
2. Check browser permissions for camera access
3. Try different browsers (Chrome recommended)

### Face Recognition Not Working
1. Verify CompreFace is running: `curl http://localhost:8000/api/health`
2. Check API key in `.env` file
3. Ensure face collection exists in CompreFace UI
4. Check lighting conditions and camera quality

### High Error Rates
1. Ensure good lighting
2. Position camera at eye level
3. Avoid multiple faces in frame
4. Check CompreFace confidence thresholds

## Security Considerations

1. **Camera Permissions**: Only enable camera when kiosk is active
2. **Data Privacy**: Face data is stored securely in CompreFace
3. **API Security**: Use strong API keys and limit access
4. **Network**: Run CompreFace on localhost or secure network

## Performance Tips

1. **Camera Quality**: Use 720p or higher resolution
2. **Lighting**: Ensure consistent, bright lighting
3. **Positioning**: Camera at eye level, stable mounting
4. **Network**: Low latency between app and CompreFace

## Future Enhancements

- Real-time face detection (MediaPipe integration)
- Liveness detection
- Multiple camera support
- Advanced analytics dashboard
- Mobile app integration

## Support

For issues with:
- **CompreFace**: Check https://github.com/exadel/CompreFace
- **CourtFlow**: Review logs and contact support
- **Camera**: Check browser compatibility and permissions
