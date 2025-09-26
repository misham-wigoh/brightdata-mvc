import {
  triggerCollection,
  triggerCollectionWithWebhook,
  triggerLinkedInCompanyCollection,
  triggerBothPlatformsSimultaneously,
  pollUntilReady,
  downloadSnapshot,
  getWebhookData
} from "../services/brightdataService";
import { firebaseJobService } from "../services/firebaseService";
import { SearchInput } from "../types/brightdata";
import { Timestamp } from 'firebase-admin/firestore';

// Original function (polling-based) - DEPRECATED, use webhook version instead
export async function runBrightDataJob(inputs: SearchInput[]) {
  console.log("⚠️ Using deprecated polling method. Consider switching to webhook-based approach.");
  
  const triggerResult = await triggerCollection(inputs);

  // If BrightData returns direct results
  if (Array.isArray(triggerResult)) {
    return { direct: true, data: triggerResult };
  }

  // Extract snapshot ID
  const snapshotId = triggerResult.snapshot_id || triggerResult.snapshot || triggerResult.id || triggerResult.snapshotId;
  if (!snapshotId) throw new Error("Invalid trigger response");

  try {
    // Poll until snapshot is ready
    await pollUntilReady(snapshotId);

    // Download snapshot
    const filePath = await downloadSnapshot(snapshotId);
    return { direct: false, filePath, snapshotId };
  } catch (error: any) {
    console.error("❌ Polling/Download failed:", error.message);
    
    // If snapshot not found, suggest using webhook approach
    if (error.message.includes("snapshot not found") || error.response?.status === 404) {
      throw new Error(`Snapshot ${snapshotId} not found or expired. Consider using the webhook-based approach instead of polling.`);
    }
    
    throw error;
  }
}

// New function using webhooks with Firebase tracking
export async function runBrightDataJobWithWebhook(inputs: SearchInput[]) {
  const triggerResult = await triggerCollectionWithWebhook(inputs);

  // If BrightData returns direct results
  if (Array.isArray(triggerResult)) {
    return { 
      direct: true, 
      data: triggerResult,
      webhook: false
    };
  }

  // Extract snapshot ID
  const snapshotId = triggerResult.snapshot_id || triggerResult.snapshot || triggerResult.id || triggerResult.snapshotId;
  if (!snapshotId) throw new Error("Invalid trigger response");

  console.log(`🔥 Job triggered successfully with webhook. Snapshot ID: ${snapshotId}`);
  
  // Save initial job record to Firebase with 'triggered' status
  let firebaseDocId = null;
  try {
    firebaseDocId = await firebaseJobService.saveJobData({
      snapshotId,
      status: 'triggered',
      jobType: 'job_search',
      data: [],
      metadata: {
        triggeredAt: Timestamp.now(),
        dataCount: 0,
        webhookPayload: triggerResult
      },
      searchParams: {
        keyword: inputs[0]?.keyword,
        location: inputs[0]?.location,
        country: inputs[0]?.country
      }
    });
    
    console.log(`🔥 Initial job record saved to Firebase: ${firebaseDocId}`);
  } catch (firebaseError: any) {
    console.error('❌ Failed to save initial job record to Firebase:', firebaseError.message);
    // Continue processing even if Firebase fails
  }
  
  return { 
    direct: false, 
    webhook: true,
    snapshotId,
    firebaseDocId,
    message: "Job triggered successfully. Results will be delivered via webhook and saved to Firebase.",
    status: "triggered"
  };
}

// Function for LinkedIn company data collection with Firebase tracking
export async function runLinkedInCompanyJob(companyUrls: string[]) {
  const triggerResult = await triggerLinkedInCompanyCollection(companyUrls);

  // If BrightData returns direct results
  if (Array.isArray(triggerResult)) {
    return { 
      direct: true, 
      data: triggerResult,
      webhook: false
    };
  }

  // Extract snapshot ID
  const snapshotId = triggerResult.snapshot_id || triggerResult.snapshot || triggerResult.id || triggerResult.snapshotId;
  if (!snapshotId) throw new Error("Invalid trigger response");

  console.log(`🔥 LinkedIn company job triggered successfully. Snapshot ID: ${snapshotId}`);
  
  // Save initial job record to Firebase with 'triggered' status
  let firebaseDocId = null;
  try {
    firebaseDocId = await firebaseJobService.saveJobData({
      snapshotId,
      status: 'triggered',
      jobType: 'linkedin_company',
      data: [],
      metadata: {
        triggeredAt: Timestamp.now(),
        dataCount: 0,
        webhookPayload: triggerResult
      },
      searchParams: {
        companyUrls
      }
    });
    
    console.log(`🔥 Initial LinkedIn job record saved to Firebase: ${firebaseDocId}`);
  } catch (firebaseError: any) {
    console.error('❌ Failed to save initial LinkedIn job record to Firebase:', firebaseError.message);
    // Continue processing even if Firebase fails
  }
  
  return {
    direct: false,
    webhook: true,
    snapshotId,
    firebaseDocId,
    message: "LinkedIn company data job triggered successfully. Results will be delivered via webhook and saved to Firebase.",
    status: "triggered"
  };
}

export async function runBothPlatformsSimultaneously(inputs: SearchInput[]) {
  console.log("🚀 Starting simultaneous job scraping for LinkedIn and Indeed...");

  const { linkedin, indeed } = await triggerBothPlatformsSimultaneously(inputs);

  const linkedinSnapshotId = linkedin.snapshot_id || linkedin.snapshot || linkedin.id || linkedin.snapshotId;
  const indeedSnapshotId = indeed.snapshot_id || indeed.snapshot || indeed.id || indeed.snapshotId;

  if (!linkedinSnapshotId || !indeedSnapshotId) {
    throw new Error("Missing snapshot IDs from trigger responses");
  }

  // Save initial job records to Firebase for both platforms
  let linkedinFirebaseDocId = null;
  let indeedFirebaseDocId = null;

  try {
    // Save LinkedIn job
    linkedinFirebaseDocId = await firebaseJobService.saveJobData({
      snapshotId: linkedinSnapshotId,
      status: 'triggered',
      jobType: 'linkedin_jobs',
      data: [],
      metadata: {
        triggeredAt: Timestamp.now(),
        dataCount: 0,
        webhookPayload: linkedin,
        platform: 'linkedin'
      } as any,
      searchParams: {
        keyword: inputs[0]?.keyword,
        location: inputs[0]?.location,
        country: inputs[0]?.country
      }
    });

    // Save Indeed job
    indeedFirebaseDocId = await firebaseJobService.saveJobData({
      snapshotId: indeedSnapshotId,
      status: 'triggered',
      jobType: 'indeed_jobs',
      data: [],
      metadata: {
        triggeredAt: Timestamp.now(),
        dataCount: 0,
        webhookPayload: indeed,
        platform: 'indeed'
      } as any,
      searchParams: {
        keyword: inputs[0]?.keyword,
        location: inputs[0]?.location,
        country: inputs[0]?.country
      }
    });

    console.log(`✅ Both jobs saved to Firebase - LinkedIn: ${linkedinFirebaseDocId}, Indeed: ${indeedFirebaseDocId}`);
  } catch (firebaseError: any) {
    console.error('❌ Failed to save job records to Firebase:', firebaseError.message);
  }

  return {
    linkedin: {
      snapshotId: linkedinSnapshotId,
      firebaseDocId: linkedinFirebaseDocId,
      status: "triggered",
      platform: "linkedin"
    },
    indeed: {
      snapshotId: indeedSnapshotId,
      firebaseDocId: indeedFirebaseDocId,
      status: "triggered",
      platform: "indeed"
    },
    message: "Both LinkedIn and Indeed jobs triggered successfully. Results will be delivered via webhooks and saved to Firebase.",
    webhook: true,
    simultaneous: true
  };
}

// Enhanced function to check results from both local files and Firebase
export async function getJobResults(snapshotId: string) {
  try {
    // First, try to get data from local files
    const localData = getWebhookData(snapshotId);
    
    // Then, try to get data from Firebase
    let firebaseJob = null;
    try {
      firebaseJob = await firebaseJobService.getJobBySnapshotId(snapshotId);
    } catch (firebaseError: any) {
      console.error("Error retrieving data from Firebase:", firebaseError.message);
    }
    
    // Determine the best source of data
    const hasLocalData = localData && localData.length > 0;
    const hasFirebaseData = firebaseJob && firebaseJob.data && firebaseJob.data.length > 0;
    
    if (hasLocalData || hasFirebaseData) {
      // Prefer Firebase data if available and more recent, otherwise use local
      const primaryData = hasFirebaseData ? firebaseJob!.data : localData;
      const dataSource = hasFirebaseData ? 'firebase' : 'local';
      
      return {
        found: true,
        snapshotId,
        dataCount: primaryData.length,
        data: primaryData,
        source: dataSource,
        firebase: {
          available: !!firebaseJob,
          status: firebaseJob?.status,
          jobType: firebaseJob?.jobType,
          documentId: firebaseJob?.id,
          dataCount: firebaseJob?.metadata.dataCount || 0
        },
        local: {
          available: hasLocalData,
          dataCount: localData?.length || 0
        }
      };
    } else {
      return {
        found: false,
        snapshotId,
        message: "No webhook data found for this snapshot ID in local files or Firebase. Job might still be running or failed.",
        firebase: {
          available: !!firebaseJob,
          status: firebaseJob?.status || 'not_found'
        },
        local: {
          available: false
        }
      };
    }
  } catch (error: any) {
    console.error("Error retrieving job results:", error);
    return {
      found: false,
      snapshotId,
      error: error.message
    };
  }
}