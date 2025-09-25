import type { NextApiRequest, NextApiResponse } from 'next';
import { firebaseJobService } from '../../services/firebaseService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { snapshotId, status, action, limit, startAfter } = req.query;

      // Get job statistics
      if (action === 'stats') {
        const stats = await firebaseJobService.getJobStats();
        return res.status(200).json({
          success: true,
          stats
        });
      }

      // Get specific job by snapshot ID
      if (snapshotId && typeof snapshotId === 'string') {
        const job = await firebaseJobService.getJobBySnapshotId(snapshotId);
        
        if (job) {
          return res.status(200).json({
            success: true,
            job
          });
        } else {
          return res.status(404).json({
            success: false,
            message: 'Job not found',
            snapshotId
          });
        }
      }

      // Get jobs by status
      if (status && typeof status === 'string') {
        const jobs = await firebaseJobService.getJobsByStatus(status);
        return res.status(200).json({
          success: true,
          jobs,
          count: jobs.length,
          status
        });
      }

      // Get all jobs with pagination
      const limitNum = limit ? parseInt(limit as string) : 50;
      const jobs = await firebaseJobService.getAllJobs(
        limitNum,
        startAfter as string | undefined
      );

      return res.status(200).json({
        success: true,
        jobs,
        count: jobs.length,
        pagination: {
          limit: limitNum,
          startAfter: startAfter || null
        }
      });
    }

    if (req.method === 'DELETE') {
      const { jobId } = req.query;

      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing jobId parameter'
        });
      }

      await firebaseJobService.deleteJob(jobId);
      
      return res.status(200).json({
        success: true,
        message: 'Job deleted successfully',
        jobId
      });
    }

    if (req.method === 'PUT') {
      const { jobId } = req.query;
      const updateData = req.body;

      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing jobId parameter'
        });
      }

      await firebaseJobService.updateJobData(jobId, updateData);
      
      return res.status(200).json({
        success: true,
        message: 'Job updated successfully',
        jobId
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      allowedMethods: ['GET', 'PUT', 'DELETE']
    });

  } catch (error: any) {
    console.error('Error in firebase-jobs API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}