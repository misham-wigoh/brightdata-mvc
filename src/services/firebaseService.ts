// services/firebaseService.ts - Improved Firebase service
import { db } from '../lib/firebase';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Format Timestamp to readable string: "September 29, 2025 at 5:55:31 PM UTC+5:30"
 */
function formatTimestamp(timestamp: Timestamp = Timestamp.now()): string {
  const date = timestamp.toDate();
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

export interface JobData {
  id?: string;
  snapshotId: string;
  status: string;
  jobType: string;
  data: any[];
  metadata: {
    triggeredAt: string;
    completedAt?: string;
    dataCount: number;
    webhookPayload?: any;
    error?: string;
    updatedAt?: string;
    processedAt?: string;
    lastStatusUpdate?: string;
    fixedAt?: string;
  };
  searchParams?: {
    keyword?: string;
    location?: string;
    country?: string;
    companyUrls?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export class FirebaseJobService {
  private linkedinCollection = db.collection('linkedin_jobs');
  private indeedCollection = db.collection('indeed_jobs');

  /**
   * Clean undefined values from object (Firestore doesn't allow undefined)
   */
  private cleanUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return {};
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanUndefinedValues(item)).filter(item => item !== undefined);
    }

    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
          const cleanedValue = this.cleanUndefinedValues(value);
          if (cleanedValue !== undefined && cleanedValue !== null &&
              !(typeof cleanedValue === 'object' && Object.keys(cleanedValue).length === 0)) {
            cleaned[key] = cleanedValue;
          }
        }
      }
      return cleaned;
    }

    return obj;
  }

  /**
   * Get the appropriate collection based on job type
   */
  private getCollection(jobType: string) {
    switch (jobType?.toLowerCase()) {
      case 'linkedin_jobs':
      case 'linkedin':
        return this.linkedinCollection;
      case 'indeed_jobs':
      case 'indeed':
        return this.indeedCollection;
      default:
        throw new Error(`Unknown job type: ${jobType}. Expected 'linkedin_jobs' or 'indeed_jobs'`);
    }
  }


  /**
   * Save job data to Firebase with improved error handling
   */
  async saveJobData(jobData: Partial<JobData>): Promise<string> {
    try {
      const now = formatTimestamp(Timestamp.now());

      // Ensure data array is not null/undefined
      const dataArray = Array.isArray(jobData.data) ? jobData.data : [];

      // Debug incoming data structure
      console.log('📥 Incoming job data structure:', {
        hasData: !!jobData.data,
        dataLength: dataArray.length,
        snapshotId: jobData.snapshotId,
        jobType: jobData.jobType,
        hasSearchParams: !!jobData.searchParams,
        searchParamsKeys: Object.keys(jobData.searchParams || {}),
        searchParamsValues: jobData.searchParams
      });

      // Prepare document data
      const docData: JobData = {
        snapshotId: jobData.snapshotId!,
        status: jobData.status || 'completed',
        jobType: jobData.jobType || 'unknown',
        data: dataArray,
        metadata: this.cleanUndefinedValues({
          triggeredAt: jobData.metadata?.triggeredAt || now,
          completedAt: jobData.metadata?.completedAt || now,
          dataCount: dataArray.length,
          webhookPayload: jobData.metadata?.webhookPayload,
          processedAt: now,
          ...jobData.metadata
        }),
        searchParams: this.cleanUndefinedValues(jobData.searchParams || {}),
        createdAt: jobData.createdAt || now,
        updatedAt: now
      };

      console.log('🔍 Saving to Firebase:', {
        snapshotId: jobData.snapshotId,
        status: jobData.status,
        jobType: jobData.jobType,
        dataCount: dataArray.length
      });

      // Clean undefined values before saving
      console.log('🧹 Cleaning document data...');
      const cleanedDocData = this.cleanUndefinedValues(docData);

      // Debug log to check for undefined values
      console.log('🔍 Cleaned document sample:', {
        snapshotId: cleanedDocData.snapshotId,
        jobType: cleanedDocData.jobType,
        searchParams: cleanedDocData.searchParams,
        metadataKeys: Object.keys(cleanedDocData.metadata || {}),
        hasUndefinedInSearchParams: Object.values(cleanedDocData.searchParams || {}).some(v => v === undefined)
      });

      // Get the appropriate collection based on job type
      const targetCollection = this.getCollection(cleanedDocData.jobType);

      console.log(`🎯 Saving to collection: ${cleanedDocData.jobType} → ${targetCollection.id}`);

      // Create the main document
      const docRef = await targetCollection.add(cleanedDocData);

      console.log(`✅ Job data saved to Firebase with ID: ${docRef.id} (${dataArray.length} records)`);

      return docRef.id;
    } catch (error: any) {
      console.error('❌ Error saving job data to Firebase:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Update existing job data with improved data handling
   */
  async updateJobData(docId: string, updateData: Partial<JobData>, jobType: string): Promise<void> {
    try {
      const now = formatTimestamp(Timestamp.now());

      // Get current document from the appropriate collection
      const collection = this.getCollection(jobType);
      const docRef = collection.doc(docId);
      const docSnapshot = await docRef.get();

      if (!docSnapshot.exists) {
        throw new Error(`Document ${docId} not found`);
      }

      const updates: any = {
        ...updateData,
        updatedAt: now
      };

      // Handle data array updates
      if (Array.isArray(updateData.data)) {
        console.log(`🔍 Updating Firebase doc ${docId}:`, {
          newDataCount: updateData.data.length
        });

        updates.data = updateData.data;
        updates.metadata = {
          ...updates.metadata,
          dataCount: updateData.data.length
        };
      }

      await docRef.update(updates);

      console.log(`✅ Job data updated in Firebase: ${docId} (${updates.metadata?.dataCount || 'no data changes'} records)`);
    } catch (error: any) {
      console.error('❌ Error updating job data in Firebase:', error);
      console.error('Update data:', updateData);
      throw error;
    }
  }

  /**
   * Get job data by snapshot ID with better logging - searches all collections
   */
  async getJobBySnapshotId(snapshotId: string): Promise<JobData | null> {
    try {
      console.log(`🔍 Searching all collections for snapshot: ${snapshotId}`);

      // Search in all collections
      const collections = [this.linkedinCollection, this.indeedCollection];

      for (const collection of collections) {
        const snapshot = await collection
          .where('snapshotId', '==', snapshotId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const jobData = {
            id: doc.id,
            ...doc.data()
          } as JobData;

          console.log(`✅ Found job in collection ${collection.id}:`, {
            id: jobData.id,
            status: jobData.status,
            dataCount: jobData.metadata.dataCount,
            actualArrayLength: jobData.data.length
          });

          return jobData;
        }
      }

      console.log(`📭 No job found in any collection for snapshot: ${snapshotId}`);
      return null;
    } catch (error: any) {
      console.error('❌ Error fetching job data from Firebase:', error);
      throw error;
    }
  }


  /**
   * Get LinkedIn jobs specifically
   */
  async getLinkedInJobs(limit: number = 5): Promise<JobData[]> {
    try {
      const snapshot = await this.linkedinCollection
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as JobData));

      console.log(`📊 Retrieved ${jobs.length} LinkedIn jobs`);
      return jobs;
    } catch (error: any) {
      console.error('❌ Error fetching LinkedIn jobs:', error);
      throw error;
    }
  }

  /**
   * Get Indeed jobs specifically
   */
  async getIndeedJobs(limit: number = 5): Promise<JobData[]> {
    try {
      const snapshot = await this.indeedCollection
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as JobData));

      console.log(`📊 Retrieved ${jobs.length} Indeed jobs`);
      return jobs;
    } catch (error: any) {
      console.error('❌ Error fetching Indeed jobs:', error);
      throw error;
    }
  }

  /**
   * Get all jobs from both LinkedIn and Indeed collections
   */
  async getAllJobs(limit: number = 100): Promise<JobData[]> {
    try {
      console.log(`🔍 Fetching all jobs from both collections (limit: ${limit})`);

      // Fetch from both collections in parallel
      const [linkedinJobs, indeedJobs] = await Promise.all([
        this.getLinkedInJobs(limit),
        this.getIndeedJobs(limit)
      ]);

      // Combine results
      const allJobs = [...linkedinJobs, ...indeedJobs];

      console.log(`📊 Retrieved ${allJobs.length} total jobs (${linkedinJobs.length} LinkedIn, ${indeedJobs.length} Indeed)`);
      return allJobs;
    } catch (error: any) {
      console.error('❌ Error fetching all jobs:', error);
      throw error;
    }
  }

  /**
   * Delete a job by document ID
   */
  async deleteJob(docId: string): Promise<void> {
    try {
      // Try to find and delete from both collections
      const collections = [this.linkedinCollection, this.indeedCollection];

      for (const collection of collections) {
        const docRef = collection.doc(docId);
        const doc = await docRef.get();

        if (doc.exists) {
          await docRef.delete();
          console.log(`✅ Deleted job ${docId} from ${collection.id}`);
          return;
        }
      }

      throw new Error(`Document ${docId} not found in any collection`);
    } catch (error: any) {
      console.error('❌ Error deleting job:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const firebaseJobService = new FirebaseJobService();
