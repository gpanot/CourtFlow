# Railway Face Recognition Setup Guide

## 🚀 Production Deployment Steps

### 1. Deploy CompreFace to Railway

1. **Create new Railway project**
2. **Deploy from GitHub** or upload the `railway/compreface/` directory
3. **Set Environment Variables**:
   ```
   API_KEY=25ae343a7c2a64347475d18501a74287f7ec0272d9f7c28ddc76b98fb3fe8451
   POSTGRES_HOST=postgres
   POSTGRES_PORT=5432
   POSTGRES_USER=compreface
   POSTGRES_PASSWORD=compreface123
   POSTGRES_DB=compreface
   REDIS_HOST=redis
   REDIS_PORT=6379
   ```
4. **Deploy** - Railway will automatically set up PostgreSQL and Redis
5. **Get the URL** - It will be something like `https://your-app-name.railway.app`

### 2. Update CourtFlow Environment Variables

In your Railway CourtFlow service, add these environment variables:

```env
# CompreFace Face Recognition
COMPREFACE_API_URL=https://your-compreface-app.railway.app/api/v1
COMPREFACE_API_KEY=25ae343a7c2a64347475d18501a74287f7ec0272d9f7c28ddc76b98fb3fe8451
COMPREFACE_COLLECTION_NAME=courtflow_players
```

### 3. Database Migration

The database schema is already updated with:
- ✅ `faceSubjectId` field in Player table
- ✅ `queueNumber` field in QueueEntry table  
- ✅ `FaceAttempt` and `KioskDevice` tables

No additional migration needed - it's already applied!

### 4. Deploy CourtFlow

Deploy your main CourtFlow app to Railway with the new environment variables.

### 5. Test Face Recognition

1. **Open the staff dashboard** at your Railway URL
2. **Go to Check-in tab**
3. **Click "Capture Face"** 
4. **Allow camera permissions**
5. **Test face enrollment and recognition**

## 🔧 Verification Steps

### Test 1: CompreFace Health Check
```bash
curl https://your-compreface-app.railway.app/api/health
```
Should return: `{"status": "ok"}`

### Test 2: Face Collection Creation
The collection should be created automatically. Verify in CompreFace UI.

### Test 3: CourtFlow Integration
- Try enrolling a face
- Check if `faceSubjectId` is saved to database
- Try recognizing the same face

## 🐛 Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure CourtFlow URL is allowed in CompreFace
2. **API Key Invalid**: Double-check the API key matches
3. **Database Connection**: Ensure Prisma can connect to Railway PostgreSQL
4. **Camera Not Working**: Check HTTPS (Railway provides HTTPS automatically)

### Debug Commands:

```bash
# Check CompreFace logs on Railway
railway logs compreface-service

# Check CourtFlow logs  
railway logs courtflow-service

# Test API connection
curl -H "x-api-key: YOUR_API_KEY" \
     https://your-compreface-app.railway.app/api/v1/health
```

## 📊 Monitoring

### Railway Metrics to Watch:
- **CPU/Memory usage** on CompreFace service
- **Database connections** 
- **API response times**
- **Error rates**

### Face Recognition Metrics:
- **Enrollment success rate**
- **Recognition accuracy**
- **Processing time** (should be <3 seconds)
- **Queue number assignment**

## 🔒 Security Considerations

1. **API Key Security**: Never commit API keys to Git
2. **HTTPS Only**: Railway provides HTTPS automatically
3. **Database Security**: Use Railway's built-in PostgreSQL
4. **Rate Limiting**: Consider adding rate limiting to face recognition endpoints

## 📈 Scaling

### When to Scale CompreFace:
- **High CPU usage** (>80%)
- **Slow response times** (>3 seconds)
- **Multiple venues** needing face recognition

### Scaling Options:
- **Upgrade Railway plan** for more resources
- **Add Redis caching** for frequent faces
- **Load balance multiple CompreFace instances**

## 🎯 Success Metrics

### Target Performance:
- **Face enrollment**: <2 seconds
- **Face recognition**: <1.5 seconds  
- **Accuracy rate**: >95%
- **Uptime**: >99%

### User Experience:
- **Seamless check-in** with face recognition
- **Queue numbers** assigned correctly
- **Real-time updates** in staff dashboard
- **Mobile-friendly** camera interface

---

**🎉 Your face recognition system is ready for production!**
