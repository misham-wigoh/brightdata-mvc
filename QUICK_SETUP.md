# Quick Setup Guide - BrightData to Firebase Integration

## ✅ Current Status

Your BrightData webhook integration is **WORKING**! The webhook endpoint successfully receives and processes data from BrightData.

## 🔧 Current Configuration

### Environment Variables (`.env.local`)
```bash
BRIGHTDATA_API_KEY=8877c909b30ec94f0e10437f047d5ee51b06401fd26ea23a436340525b4a2905
BRIGHTDATA_DATASET_ID=gd_lpfll7v5hcqtkxl6l
WEBHOOK_URL=https://4219712a6e3f.ngrok-free.app/api/brightdata-results
FIREBASE_PROJECT_ID=scraper-a35fd
```

### Server Status
- ✅ Next.js server running on `http://localhost:3001`
- ✅ Webhook endpoint working: `/api/brightdata-results-test`
- ✅ Data processing and normalization working
- ⚠️ Firebase Admin SDK needs proper credentials

## 🚀 Next Steps

### 1. Update ngrok (IMPORTANT!)
Your server is running on port **3001**, but your ngrok might be pointing to port 3000. Update it:

```bash
# Kill current ngrok if running
pkill ngrok

# Start ngrok pointing to correct port
ngrok http 3001
```

Then update your `.env.local` with the new ngrok URL:
```bash
WEBHOOK_URL=https://YOUR_NEW_NGROK_URL.ngrok-free.app/api/brightdata-results-test
```

### 2. Fix Firebase Connection (Choose One Option)

#### Option A: Use Firebase CLI (Recommended for local development)
```bash
# Login to Firebase
firebase login

# Set your project
firebase use scraper-a35fd

# Update your webhook endpoint from -test to the real one
WEBHOOK_URL=https://YOUR_NGROK_URL.ngrok-free.app/api/brightdata-results
```

#### Option B: Use Service Account (For production)
1. Go to [Firebase Console](https://console.firebase.google.com/project/scraper-a35fd/settings/serviceaccounts/adminsdk)
2. Click "Generate new private key"
3. Download the JSON file
4. Add to your `.env.local`:
```bash
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"scraper-a35fd",...}'
```

### 3. Test the Complete Flow

#### Test 1: Webhook Endpoint
```bash
curl -X POST "http://localhost:3001/api/brightdata-results-test" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_id": "test-123",
    "data": [{"title": "Test Job", "company": "Test Corp", "location": "Test City"}]
  }'
```

#### Test 2: Trigger BrightData Job
1. Open `http://localhost:3001` in your browser
2. Go to "Dashboard" tab
3. Enter job search criteria
4. Click "Trigger Job Search"
5. Check logs for webhook calls

#### Test 3: View Saved Jobs
1. If using Firebase: Go to "Saved Jobs" tab in the web interface
2. If using file storage: Check `webhook-data/` folder for JSON files

## 📊 How It Works

```
1. Dashboard → Trigger BrightData Job
      ↓
2. BrightData → Scrapes job data
      ↓
3. BrightData → Sends webhook to your app
      ↓
4. Your App → Receives data via /api/brightdata-results
      ↓
5. Your App → Saves to Firebase/Local Storage
      ↓
6. Web Interface → Displays saved jobs
```

## 🐛 Troubleshooting

### Issue: "Fetch is getting failed"
- **Cause**: ngrok URL pointing to wrong port or not accessible
- **Fix**: Update ngrok to point to port 3001 and update WEBHOOK_URL

### Issue: "Data are not shown in the UI"
- **Cause**: Firebase credentials not properly configured
- **Fix**: Use the working test endpoint first, then fix Firebase

### Issue: "Firebase Admin initialization failed"
- **Cause**: Invalid or missing Firebase credentials
- **Fix**: Use Firebase CLI login or proper service account

## 📁 File Locations

- **Webhook endpoints**: `src/pages/api/brightdata-results.ts` (Firebase) and `src/pages/api/brightdata-results-test.ts` (local files)
- **Firebase service**: `src/services/firebaseService.ts`
- **BrightData service**: `src/services/brightdataService.ts`
- **Web interface**: `src/app/page.tsx` with dashboard and jobs list
- **Saved data**:
  - Firebase: `job_posts` collection
  - Local: `webhook-data/` folder

## ✨ Current Working Features

1. ✅ **Webhook Reception**: Successfully receives data from BrightData
2. ✅ **Data Processing**: Normalizes job data to consistent format
3. ✅ **Local Storage**: Saves data to JSON files as backup
4. ✅ **Web Dashboard**: Interface to trigger jobs and view results
5. ⚠️ **Firebase Storage**: Ready to work once credentials are fixed

## 🔄 Production Deployment

When ready for production:

1. Deploy to Vercel/Netlify
2. Update `WEBHOOK_URL` to production domain
3. Use Firebase service account (not CLI)
4. Update BrightData webhook configuration
5. Test end-to-end flow

---

**Status**: Webhook integration is working! Firebase just needs proper credentials setup.