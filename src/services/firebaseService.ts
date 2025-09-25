// services/firebaseService.ts - Improved Firebase service
import { db } from '../lib/firebase';
import { Timestamp } from 'firebase-admin/firestore';

export interface JobData {
  id?: string;
  snapshotId: string;
  status: string;
  jobType: string;
  data: any[];
  metadata: {
    triggeredAt: Timestamp;
    completedAt?: Timestamp;
    dataCount: number;
    webhookPayload?: any;
    error?: string;
    updatedAt?: Timestamp;
    processedAt?: Timestamp;
    lastStatusUpdate?: Timestamp;
    fixedAt?: Timestamp;
  };
  searchParams?: {
    keyword?: string;
    location?: string;
    country?: string;
    companyUrls?: string[];
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export class FirebaseJobService {
  private collection = db.collection('brightdata_jobs');

  /**
   * Save job data to Firebase with improved error handling
   */
  async saveJobData(jobData: Partial<JobData>): Promise<string> {
    try {
      const now = Timestamp.now();
      
      // Ensure data array is not null/undefined
      const dataArray = Array.isArray(jobData.data) ? jobData.data : [];
      
      const docData: JobData = {
        snapshotId: jobData.snapshotId!,
        status: jobData.status || 'completed',
        jobType: jobData.jobType || 'unknown',
        data: dataArray,
        metadata: {
          triggeredAt: jobData.metadata?.triggeredAt || now,
          completedAt: jobData.metadata?.completedAt || now,
          dataCount: dataArray.length, // Use actual array length
          webhookPayload: jobData.metadata?.webhookPayload,
          processedAt: now,
          ...jobData.metadata // Spread any additional metadata
        },
        searchParams: jobData.searchParams || {},
        createdAt: jobData.createdAt || now,
        updatedAt: now
      };

      // Log data being saved for debugging
      console.log('🔍 Saving to Firebase:', {
        snapshotId: docData.snapshotId,
        status: docData.status,
        jobType: docData.jobType,
        dataCount: docData.metadata.dataCount,
        actualArrayLength: docData.data.length,
        hasSearchParams: Object.keys(docData.searchParams || {}).length > 0
      });

      const docRef = await this.collection.add(docData);
      
      console.log(`✅ Job data saved to Firebase with ID: ${docRef.id} (${docData.metadata.dataCount} records)`);
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
  async updateJobData(docId: string, updateData: Partial<JobData>): Promise<void> {
    try {
      const now = Timestamp.now();
      
      // If updating data array, ensure proper count
      const updates: any = {
        ...updateData,
        updatedAt: now
      };

      // Update dataCount if data array is being updated
      if (Array.isArray(updateData.data)) {
        updates.data = updateData.data;
        if (updates.metadata) {
          updates.metadata.dataCount = updateData.data.length;
        } else {
          updates['metadata.dataCount'] = updateData.data.length;
        }
      }

      console.log(`🔍 Updating Firebase doc ${docId}:`, {
        hasData: !!updateData.data,
        dataCount: Array.isArray(updateData.data) ? updateData.data.length : 'unchanged',
        status: updateData.status || 'unchanged'
      });
      
      await this.collection.doc(docId).update(updates);
      
      console.log(`✅ Job data updated in Firebase: ${docId}`);
    } catch (error: any) {
      console.error('❌ Error updating job data in Firebase:', error);
      console.error('Update data:', updateData);
      throw error;
    }
  }

  /**
   * Get job data by snapshot ID with better logging
   */
  async getJobBySnapshotId(snapshotId: string): Promise<JobData | null> {
    try {
      console.log(`🔍 Searching Firebase for snapshot: ${snapshotId}`);
      
      const snapshot = await this.collection
        .where('snapshotId', '==', snapshotId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        console.log(`📭 No job found in Firebase for snapshot: ${snapshotId}`);
        return null;
      }

      const doc = snapshot.docs[0];
      const jobData = {
        id: doc.id,
        ...doc.data()
      } as JobData;

      console.log(`✅ Found job in Firebase:`, {
        id: jobData.id,
        status: jobData.status,
        dataCount: jobData.metadata.dataCount,
        actualArrayLength: Array.isArray(jobData.data) ? jobData.data.length : 'not array'
      });

      return jobData;
    } catch (error: any) {
      console.error('❌ Error fetching job data from Firebase:', error);
      throw error;
    }
  }

  /**
   * Get all jobs with pagination and better error handling
   */
  async getAllJobs(limit: number = 50, startAfter?: string): Promise<JobData[]> {
    try {
      let query = this.collection
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (startAfter) {
        const startDoc = await this.collection.doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }

      const snapshot = await query.get();
      
      const jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as JobData));

      console.log(`📊 Retrieved ${jobs.length} jobs from Firebase`);
      return jobs;
    } catch (error: any) {
      console.error('❌ Error fetching jobs from Firebase:', error);
      throw error;
    }
  }

  /**
   * Delete job data
   */
  async deleteJob(docId: string): Promise<void> {
    try {
      await this.collection.doc(docId).delete();
      console.log(`✅ Job deleted from Firebase: ${docId}`);
    } catch (error: any) {
      console.error('❌ Error deleting job from Firebase:', error);
      throw error;
    }
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(status: string): Promise<JobData[]> {
    try {
      const snapshot = await this.collection
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .get();

      const jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as JobData));

      console.log(`📊 Found ${jobs.length} jobs with status: ${status}`);
      return jobs;
    } catch (error: any) {
      console.error('❌ Error fetching jobs by status from Firebase:', error);
      throw error;
    }
  }

  /**
   * Get job statistics with improved calculations
   */
  async getJobStats(): Promise<{
    total: number;
    byStatus: { [key: string]: number };
    totalRecords: number;
    averageRecordsPerJob: number;
    lastUpdated: Date;
  }> {
    try {
      const snapshot = await this.collection.get();
      
      const stats = {
        total: snapshot.size,
        byStatus: {} as { [key: string]: number },
        totalRecords: 0,
        averageRecordsPerJob: 0,
        lastUpdated: new Date()
      };

      snapshot.docs.forEach(doc => {
        const data = doc.data() as JobData;
        
        // Count by status
        stats.byStatus[data.status] = (stats.byStatus[data.status] || 0) + 1;
        
        // Count total records using both metadata and actual array length
        const recordCount = Array.isArray(data.data) ? data.data.length : (data.metadata.dataCount || 0);
        stats.totalRecords += recordCount;
      });

      // Calculate average
      stats.averageRecordsPerJob = stats.total > 0 ? Math.round(stats.totalRecords / stats.total * 100) / 100 : 0;

      console.log(`📈 Firebase stats:`, stats);
      return stats;
    } catch (error: any) {
      console.error('❌ Error fetching job stats from Firebase:', error);
      throw error;
    }
  }

  /**
   * Find jobs with data count mismatches (for debugging)
   */
  async findDataCountMismatches(): Promise<JobData[]> {
    try {
      const snapshot = await this.collection.get();
      const mismatches: JobData[] = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data() as JobData;
        const actualCount = Array.isArray(data.data) ? data.data.length : 0;
        const recordedCount = data.metadata.dataCount || 0;

        if (actualCount !== recordedCount) {
          mismatches.push({
            id: doc.id,
            ...data
          } as JobData);
        }
      });

      console.log(`🔍 Found ${mismatches.length} jobs with data count mismatches`);
      return mismatches;
    } catch (error: any) {
      console.error('❌ Error finding data count mismatches:', error);
      throw error;
    }
  }

  /**
   * Fix data count mismatches
   */
  async fixDataCountMismatches(): Promise<number> {
    try {
      const mismatches = await this.findDataCountMismatches();
      let fixed = 0;

      for (const job of mismatches) {
        if (job.id) {
          const actualCount = Array.isArray(job.data) ? job.data.length : 0;
          await this.updateJobData(job.id, {
            metadata: {
              ...job.metadata,
              dataCount: actualCount,
              fixedAt: Timestamp.now()
            }
          });
          fixed++;
          console.log(`🔧 Fixed data count for job ${job.id}: ${job.metadata.dataCount} → ${actualCount}`);
        }
      }

      console.log(`✅ Fixed ${fixed} data count mismatches`);
      return fixed;
    } catch (error: any) {
      console.error('❌ Error fixing data count mismatches:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const firebaseJobService = new FirebaseJobService();