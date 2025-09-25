// pages/api/consume.ts - Improved webhook handler
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { firebaseJobService } from '../../services/firebaseService';
import { Timestamp } from 'firebase-admin/firestore';

// Helper function to determine job type from data
function determineJobType(data: any[]): string {
  if (!data || data.length === 0) return 'unknown';
  
  const firstItem = data[0];
  
  // Check if it's LinkedIn company data
  if (firstItem.company_name || firstItem.linkedin_url || firstItem.company_url) {
    return 'linkedin_company';
  }
  
  // Check if it's job search data
  if (firstItem.job_title || firstItem.job_url || firstItem.company || firstItem.job_posting_id) {
    return 'job_search';
  }
  
  return 'unknown';
}

// Helper function to extract search parameters from job data
function extractSearchParams(data: any[], jobType: string): any {
  const searchParams: any = {};
  
  if (jobType === 'job_search' && data && data.length > 0) {
    // Extract search params from discovery_input or input
    const firstJob = data[0];
    
    if (firstJob.discovery_input) {
      searchParams.keyword = firstJob.discovery_input.keyword;
      searchParams.location = firstJob.discovery_input.location;
      searchParams.country = firstJob.discovery_input.country;
    } else if (firstJob.input?.discovery_input) {
      searchParams.keyword = firstJob.input.discovery_input.keyword;
      searchParams.location = firstJob.input.discovery_input.location;
      searchParams.country = firstJob.input.discovery_input.country;
    }
  }
  
  if (jobType === 'linkedin_company' && data && data.length > 0) {
    // Extract company URLs
    const companyUrls = data
      .map((item: any) => item.linkedin_url || item.company_url || item.url)
      .filter((url: string) => url);
    
    if (companyUrls.length > 0) {
      searchParams.companyUrls = companyUrls;
    }
  }
  
  return searchParams;
}

// Helper function to extract snapshot ID from various possible sources
function extractSnapshotId(payload: any): string | null {
  // Try different possible locations for snapshot ID
  return payload.snapshot_id || 
         payload.snapshot || 
         payload.id || 
         payload.snapshotId ||
         null;
}

// Helper function to extract actual job data from various webhook formats
function extractJobDataFromPayload(payload: any): { data: any[], snapshotId: string | null } {
  let dataArray: any[] = [];
  let snapshotId: string | null = null;

  console.log('Analyzing webhook payload structure...');
  
  // Case 1: Direct array format (most common from BrightData)
  if (Array.isArray(payload)) {
    console.log('✓ Detected direct array format');
    dataArray = payload;
    
    // Try to extract snapshot ID from first item's input
    if (payload.length > 0) {
      const firstItem = payload[0];
      snapshotId = extractSnapshotId(firstItem.input) || 
                  extractSnapshotId(firstItem) ||
                  `job_${firstItem.job_posting_id || Date.now()}`;
    }
  }
  // Case 2: Wrapped format { data: [...] }
  else if (payload.data && Array.isArray(payload.data)) {
    console.log('✓ Detected wrapped data format');
    dataArray = payload.data;
    snapshotId = extractSnapshotId(payload);
  }
  // Case 3: Single object with job data
  else if (payload.job_title || payload.company || payload.job_url) {
    console.log('✓ Detected single job object');
    dataArray = [payload];
    snapshotId = extractSnapshotId(payload) || `single_${Date.now()}`;
  }
  // Case 4: Nested structure
  else if (payload.results && Array.isArray(payload.results)) {
    console.log('✓ Detected results array format');
    dataArray = payload.results;
    snapshotId = extractSnapshotId(payload);
  }
  // Case 5: Status update only (no data)
  else if (payload.status && (payload.snapshot_id || payload.id)) {
    console.log('✓ Detected status update format');
    dataArray = [];
    snapshotId = extractSnapshotId(payload);
  }
  
  console.log(`Extracted ${dataArray.length} records with snapshot ID: ${snapshotId}`);
  return { data: dataArray, snapshotId };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow both POST and GET methods for testing
  if (req.method !== 'POST' && req.method   !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST', 'GET']
    });
  }

  // Handle GET request for testing webhook endpoint
  if (req.method === 'GET') {
    return res.status(200).json({ 
      message: 'BrightData Webhook Consumer is active',
      timestamp: new Date().toISOString(),
      endpoint: '/api/consume',
      firebase: 'enabled',
      status: 'ready'
    });
  }

  // Verify authorization for POST requests
  const expectedSecret = process.env.WEBHOOK_SECRET || process.env.BRIGHTDATA_API_KEY;
  const authHeader = req.headers['authorization'] || '';
  const brightDataAuthHeader = req.headers['x-brightdata-auth'] || req.headers['brightdata-auth'] || '';
  const urlAuthParam = req.query.auth_header || ''; // Bright Data sends auth in URL param

  // Check multiple auth methods that Bright Data might use
  const isValidAuth = 
    authHeader === `Bearer ${expectedSecret}` ||
    authHeader === expectedSecret ||
    brightDataAuthHeader === expectedSecret ||
    urlAuthParam === expectedSecret ||
    !expectedSecret; // Allow if no secret configured (for testing)

  console.log('🔐 Auth check:', {
    hasAuthHeader: !!authHeader,
    hasBrightDataHeader: !!brightDataAuthHeader,
    hasUrlAuthParam: !!urlAuthParam,
    expectedSecretLength: expectedSecret?.length || 0,
    isValidAuth
  });

  if (expectedSecret && !isValidAuth) {
    console.warn('⚠️ Unauthorized webhook attempt', { 
      receivedAuth: authHeader?.slice?.(0, 20) + '...',
      receivedBrightDataAuth: brightDataAuthHeader?.slice?.(0, 20) + '...',
      receivedUrlAuth: typeof urlAuthParam === 'string' ? urlAuthParam?.slice?.(0, 20) + '...' : 'not string',
      expectedLength: expectedSecret?.length || 0,
      timestamp: new Date().toISOString()
    });
    return res.status(401).json({ error: 'Unauthorized webhook attempt' });
  }

  // Process the webhook payload
  try {
    console.log('🎯 Webhook payload received at:', new Date().toISOString());
    console.log('📦 Raw payload:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    
    // Extract job data and snapshot ID
    const { data: dataArray, snapshotId } = extractJobDataFromPayload(payload);

    if (!snapshotId) {
      console.error('❌ No snapshot ID could be extracted from payload');
      return res.status(400).json({ 
        error: 'No snapshot ID found in payload',
        receivedKeys: Object.keys(payload || {}),
        hint: 'Expected snapshot_id, snapshot, id, or snapshotId field'
      });
    }

    console.log(`📊 Processing webhook for snapshot: ${snapshotId}`);
    console.log(`📈 Data array length: ${dataArray.length}`);

    // Save webhook data to local files (backup)
    const outputFolder = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    // Save complete webhook payload
    const webhookFilename = `webhook_${snapshotId}_${Date.now()}.json`;
    const webhookPath = path.join(outputFolder, webhookFilename);
    fs.writeFileSync(webhookPath, JSON.stringify(payload, null, 2));

    let savedFiles: any = { webhook: webhookFilename };
    let dataCount = dataArray.length;

    // If we have job data, save it separately and prepare for Firebase
    let jobData = null;
    if (dataArray.length > 0) {
      const dataFilename = `data_${snapshotId}_${Date.now()}.json`;
      const dataPath = path.join(outputFolder, dataFilename);
      fs.writeFileSync(dataPath, JSON.stringify(dataArray, null, 2));
      
      console.log(`💾 Saved ${dataArray.length} records to ${dataFilename}`);
      savedFiles.data = dataFilename;
      
      // Determine job type and extract search parameters
      const jobType = determineJobType(dataArray);
      const searchParams = extractSearchParams(dataArray, jobType);
      
      console.log(`🔍 Job analysis:`, {
        jobType,
        dataCount: dataArray.length,
        searchParams,
        sampleRecord: dataArray[0] ? Object.keys(dataArray[0]) : 'none'
      });
      
      // Prepare job data for Firebase
      jobData = {
        snapshotId,
        status: 'completed', // We have data, so it's completed
        jobType,
        data: dataArray,
        metadata: {
          triggeredAt: Timestamp.now(), // Will be updated if existing record found
          completedAt: Timestamp.now(),
          dataCount,
          webhookPayload: payload,
          processedAt: Timestamp.now()
        },
        searchParams
      };
    }

    // Check if there's an existing Firebase record to update
    let firebaseDocId = null;
    let existingJob = null;
    
    try {
      existingJob = await firebaseJobService.getJobBySnapshotId(snapshotId);
      console.log(`🔍 Existing Firebase job found: ${!!existingJob}`);
      if (existingJob) {
        console.log(`📋 Existing job status: ${existingJob.status}, current data count: ${existingJob.metadata.dataCount}`);
      }
    } catch (error) {
      console.log('ℹ️ No existing Firebase job found, will create new one');
    }

    // Save or update Firebase data
    if (jobData) {
      try {
        if (existingJob && existingJob.id) {
          // Update existing record with actual data
          const updateData = {
            status: 'completed',
            data: jobData.data,
            metadata: {
              ...existingJob.metadata,
              completedAt: Timestamp.now(),
              dataCount: jobData.data.length,
              webhookPayload: jobData.metadata.webhookPayload,
              processedAt: Timestamp.now()
            }
          };

          await firebaseJobService.updateJobData(existingJob.id!, updateData);
          firebaseDocId = existingJob.id;
          console.log(`✅ Updated existing Firebase record: ${firebaseDocId} with ${jobData.data.length} records`);
          
        } else {
          // Create new record
          firebaseDocId = await firebaseJobService.saveJobData(jobData);
          console.log(`✅ Created new Firebase record: ${firebaseDocId} with ${jobData.data.length} records`);
        }
        
      } catch (firebaseError: any) {
        console.error('❌ Failed to save/update Firebase:', firebaseError.message);
        console.error('Firebase error stack:', firebaseError.stack);
        // Continue processing even if Firebase fails
      }
    } else if (existingJob) {
      // This might be a status update without data
      try {
        const statusUpdate = {
          status: payload.status || existingJob.status,
          metadata: {
            ...existingJob.metadata,
            webhookPayload: payload,
            lastStatusUpdate: Timestamp.now()
          }
        };

        await firebaseJobService.updateJobData(existingJob.id!, statusUpdate);
        firebaseDocId = existingJob.id;
        console.log(`📊 Updated status for existing job: ${firebaseDocId} to ${statusUpdate.status}`);
      } catch (error: any) {
        console.error('❌ Failed to update job status:', error.message);
      }
    }

    // Determine final status
    const finalStatus = dataArray.length > 0 ? 'completed' : (payload.status || 'processed');
    
    console.log(`🎉 Webhook processing complete for ${snapshotId}:`);
    console.log(`   - Status: ${finalStatus}`);
    console.log(`   - Records: ${dataArray.length}`);
    console.log(`   - Firebase: ${firebaseDocId ? 'saved' : 'failed'}`);
    console.log(`   - Local files: ${Object.keys(savedFiles).join(', ')}`);

    return res.status(200).json({ 
      success: true,
      snapshotId,
      status: finalStatus,
      dataCount,
      firebase: {
        saved: !!firebaseDocId,
        documentId: firebaseDocId,
        action: existingJob ? 'updated' : 'created'
      },
      savedFiles,
      message: firebaseDocId 
        ? `Successfully processed ${dataCount} records and ${existingJob ? 'updated' : 'saved'} to Firebase`
        : `Processed ${dataCount} records locally (Firebase save failed)`,
      processedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error processing webhook:', error);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({ 
      success: false,
      error: 'Failed to process webhook',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
} 