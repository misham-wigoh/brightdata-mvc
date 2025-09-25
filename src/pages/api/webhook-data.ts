import type { NextApiRequest, NextApiResponse } from 'next';
import { getWebhookData, getAllSnapshots, saveWebhookDataLocally } from '../../services/brightdataService';
import { firebaseJobService } from '../../services/firebaseService';
import fs from 'fs';
import path from 'path';
import { Timestamp } from 'firebase-admin/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { snapshotId, action, source } = req.query;

      // Get all available snapshots from both local and Firebase
      if (action === 'list') {
        return handleListSnapshots(res, source as string);
      }

      // Get data for specific snapshot
      if (snapshotId && typeof snapshotId === 'string') {
        return handleGetSnapshotData(res, snapshotId, source as string);
      }

      // Return usage instructions if no specific query
      return res.status(200).json({
        success: true,
        message: 'Webhook Data Manager API (with Firebase support)',
        usage: {
          'Get all snapshots': 'GET /api/webhook-data?action=list&source=local|firebase|both',
          'Get specific snapshot data': 'GET /api/webhook-data?snapshotId=YOUR_SNAPSHOT_ID&source=local|firebase|both',
          'Manually save webhook data': 'POST /api/webhook-data',
          'Delete snapshot data': 'DELETE /api/webhook-data?snapshotId=YOUR_SNAPSHOT_ID'
        },
        sources: {
          local: 'Local file system',
          firebase: 'Firebase Firestore database',
          both: 'Both sources (default)'
        },
        webhookUrl: 'https://webhook.site/a640096a-2c0a-4b6e-9b9d-5698098181bc'
      });
    }

    if (req.method === 'POST') {
      // Manually save webhook data (useful if you copy data from webhook.site)
      const { snapshotId, data, saveToFirebase } = req.body;

      if (!snapshotId || !data) {
        return res.status(400).json({
          success: false,
          error: 'Missing snapshotId or data in request body'
        });
      }

      // Save to local file system
      const filePath = saveWebhookDataLocally(snapshotId, data);
      
      let firebaseDocId = null;
      
      // Optionally save to Firebase
      if (saveToFirebase !== false) {
        try {
          firebaseDocId = await firebaseJobService.saveJobData({
            snapshotId,
            status: data.status || 'manual',
            jobType: 'manual',
            data: data.data || [],
            metadata: {
              dataCount: Array.isArray(data?.data) ? data.data.length : 0,
              webhookPayload: data,
              triggeredAt: Timestamp.now()
            }
          });
        } catch (firebaseError: any) {
          console.error('Failed to save to Firebase:', firebaseError.message);
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Webhook data saved successfully',
        snapshotId,
        local: {
          filePath,
          saved: true
        },
        firebase: {
          documentId: firebaseDocId,
          saved: !!firebaseDocId
        },
        dataCount: Array.isArray(data?.data) ? data.data.length : 'unknown'
      });
    }

    if (req.method === 'DELETE') {
      // Delete webhook data for a specific snapshot
      const { snapshotId, source } = req.query;

      if (!snapshotId || typeof snapshotId !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Missing snapshotId parameter'
        });
      }

      return handleDeleteSnapshot(res, snapshotId, source as string);
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      allowedMethods: ['GET', 'POST', 'DELETE']
    });

  } catch (error: any) {
    console.error('Error in webhook-data API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

async function handleListSnapshots(res: NextApiResponse, source?: string) {
  const results: any = {};
  
  try {
    // Get local snapshots
    if (!source || source === 'local' || source === 'both') {
      results.local = getAllSnapshots();
    }

    // Get Firebase snapshots
    if (!source || source === 'firebase' || source === 'both') {
      try {
        const firebaseJobs = await firebaseJobService.getAllJobs(100);
        results.firebase = firebaseJobs.map(job => job.snapshotId);
      } catch (error) {
        results.firebase = [];
        results.firebaseError = 'Failed to fetch from Firebase';
      }
    }

    return res.status(200).json({
      success: true,
      snapshots: results,
      counts: {
        local: results.local?.length || 0,
        firebase: results.firebase?.length || 0,
        total: new Set([...(results.local || []), ...(results.firebase || [])]).size
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to list snapshots',
      details: error.message
    });
  }
}

async function handleGetSnapshotData(res: NextApiResponse, snapshotId: string, source?: string) {
  const results: any = { snapshotId };

  try {
    // Get local data
    if (!source || source === 'local' || source === 'both') {
      const localData = getWebhookData(snapshotId);
      results.local = {
        found: localData.length > 0,
        dataCount: localData.length,
        data: localData.length > 0 ? localData : null
      };
    }

    // Get Firebase data
    if (!source || source === 'firebase' || source === 'both') {
      try {
        const firebaseJob = await firebaseJobService.getJobBySnapshotId(snapshotId);
        results.firebase = {
          found: !!firebaseJob,
          job: firebaseJob,
          dataCount: firebaseJob?.metadata.dataCount || 0,
          data: firebaseJob?.data || null
        };
      } catch (error) {
        results.firebase = {
          found: false,
          error: 'Failed to fetch from Firebase'
        };
      }
    }

    // Determine overall status
    const hasLocalData = results.local?.found;
    const hasFirebaseData = results.firebase?.found;

    if (hasLocalData || hasFirebaseData) {
      return res.status(200).json({
        success: true,
        ...results,
        summary: {
          foundInLocal: hasLocalData,
          foundInFirebase: hasFirebaseData,
          totalDataCount: (results.local?.dataCount || 0) + (results.firebase?.dataCount || 0)
        }
      });
    } else {
      return res.status(404).json({
        success: false,
        ...results,
        message: 'No webhook data found for this snapshot ID in any source',
        hint: 'Check https://webhook.site/#!/a640096a-2c0a-4b6e-9b9d-5698098181bc for incoming webhooks'
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to get snapshot data',
      details: error.message
    });
  }
}

async function handleDeleteSnapshot(res: NextApiResponse, snapshotId: string, source?: string) {
  const results: any = { snapshotId };
  
  try {
    // Delete local files
    if (!source || source === 'local' || source === 'both') {
      const outputFolder = path.join(process.cwd(), 'output');
      const files = fs.readdirSync(outputFolder).filter(f => 
        f.startsWith(`webhook_${snapshotId}_`) || f.startsWith(`data_${snapshotId}_`)
      );

      let deletedCount = 0;
      files.forEach(file => {
        const filePath = path.join(outputFolder, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      });

      results.local = {
        deleted: deletedCount,
        files
      };
    }

    // Delete from Firebase
    if (!source || source === 'firebase' || source === 'both') {
      try {
        const firebaseJob = await firebaseJobService.getJobBySnapshotId(snapshotId);
        if (firebaseJob?.id) {
          await firebaseJobService.deleteJob(firebaseJob.id);
          results.firebase = { deleted: true, documentId: firebaseJob.id };
        } else {
          results.firebase = { deleted: false, reason: 'Job not found' };
        }
      } catch (error: any) {
        results.firebase = { deleted: false, error: error.message };
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Deletion completed',
      ...results
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'Failed to delete snapshot data',
      details: error.message
    });
  }
}