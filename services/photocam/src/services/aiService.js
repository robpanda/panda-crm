// AI Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { RekognitionClient, DetectLabelsCommand, DetectTextCommand } from '@aws-sdk/client-rekognition';
import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION || 'us-east-2' });
const textractClient = new TextractClient({ region: process.env.AWS_REGION || 'us-east-2' });

// Cache for OpenAI API key
let openaiApiKey = null;

/**
 * Get OpenAI API key from Secrets Manager
 */
async function getOpenAIKey() {
  if (openaiApiKey) return openaiApiKey;

  try {
    const command = new GetSecretValueCommand({ SecretId: 'openai-api-key' });
    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString);
    openaiApiKey = secret.apiKey || secret.OPENAI_API_KEY;
    return openaiApiKey;
  } catch (error) {
    logger.error('Failed to get OpenAI API key:', error);
    throw new Error('OpenAI API key not configured');
  }
}

/**
 * Analyze a photo using AWS Rekognition
 */
export async function analyzePhoto(photoId) {
  logger.info(`Analyzing photo ${photoId} with Rekognition`);

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
  });

  if (!photo) {
    const error = new Error('Photo not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Parse S3 key from URL
  const s3Key = extractS3Key(photo.originalUrl);
  const bucket = process.env.S3_BUCKET || 'pandacam-photos-prod';

  const results = {};

  // Detect labels (objects, scenes)
  try {
    const labelsCommand = new DetectLabelsCommand({
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: s3Key,
        },
      },
      MaxLabels: 20,
      MinConfidence: 70,
    });

    const labelsResponse = await rekognitionClient.send(labelsCommand);
    results.labels = labelsResponse.Labels.map((label) => ({
      name: label.Name,
      confidence: label.Confidence,
      categories: label.Categories?.map((c) => c.Name) || [],
    }));
  } catch (error) {
    logger.error('Label detection failed:', error);
    results.labels = [];
  }

  // Detect text in image
  try {
    const textCommand = new DetectTextCommand({
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: s3Key,
        },
      },
    });

    const textResponse = await rekognitionClient.send(textCommand);
    results.detectedText = textResponse.TextDetections
      .filter((t) => t.Type === 'LINE')
      .map((t) => t.DetectedText);
  } catch (error) {
    logger.error('Text detection failed:', error);
    results.detectedText = [];
  }

  // Update photo with AI results
  await prisma.photo.update({
    where: { id: photoId },
    data: {
      aiLabels: results.labels,
      detectedText: results.detectedText,
      aiProcessedAt: new Date(),
    },
  });

  logger.info(`Photo ${photoId} analysis complete`);
  return results;
}

/**
 * Generate AI description for a photo
 */
export async function generatePhotoDescription(photoId) {
  logger.info(`Generating AI description for photo ${photoId}`);

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      project: {
        select: { name: true, type: true },
      },
    },
  });

  if (!photo) {
    const error = new Error('Photo not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const apiKey = await getOpenAIKey();

  // Build context from AI labels
  const context = photo.aiLabels?.map((l) => l.name).join(', ') || 'No labels detected';

  const prompt = `Generate a professional, concise description for a construction/roofing project photo.
Context: Project type: ${photo.project?.type || 'Unknown'}, Photo type: ${photo.type || 'Unknown'}
Detected elements: ${context}
Photo taken: ${photo.takenAt || 'Unknown date'}

Write a 1-2 sentence description suitable for project documentation.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional construction documentation assistant.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim();

    if (description) {
      await prisma.photo.update({
        where: { id: photoId },
        data: { aiDescription: description },
      });
    }

    return { description };
  } catch (error) {
    logger.error('AI description generation failed:', error);
    throw error;
  }
}

/**
 * Generate inspection report from project photos and data
 */
export async function generateInspectionReport(projectId, options = {}) {
  logger.info(`Generating inspection report for project ${projectId}`);

  const project = await prisma.photoProject.findUnique({
    where: { id: projectId },
    include: {
      photos: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 50, // Limit for context size
      },
      checklists: {
        include: {
          sections: {
            include: {
              items: true,
            },
          },
        },
      },
      pages: {
        orderBy: { pageNumber: 'asc' },
      },
    },
  });

  if (!project) {
    const error = new Error('Project not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const apiKey = await getOpenAIKey();

  // Build context from project data
  const photoSummary = project.photos
    .map((p) => `- ${p.type || 'Photo'}: ${p.aiDescription || p.caption || 'No description'}`)
    .join('\n');

  const checklistSummary = project.checklists
    .map((cl) => {
      const items = cl.sections.flatMap((s) => s.items);
      const completed = items.filter((i) => i.isCompleted).length;
      return `- ${cl.name}: ${completed}/${items.length} items completed`;
    })
    .join('\n');

  const notesSummary = project.pages
    .filter((p) => p.pageType === 'NOTE')
    .map((p) => `- ${p.title}: ${p.content?.substring(0, 200)}...`)
    .join('\n');

  const prompt = `Generate a professional inspection report for a ${project.type || 'construction'} project.

Project: ${project.name}
Address: ${project.address || 'Not provided'}

Photo Documentation:
${photoSummary || 'No photos documented'}

Checklist Status:
${checklistSummary || 'No checklists'}

Field Notes:
${notesSummary || 'No notes'}

${options.customInstructions || ''}

Generate a structured inspection report with:
1. Executive Summary
2. Key Findings
3. Photo Documentation Summary
4. Recommendations
5. Next Steps

Use professional, clear language suitable for customer and insurance documentation.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a professional construction inspection report writer.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const report = data.choices?.[0]?.message?.content?.trim();

    // Save report as a page
    const reportPage = await prisma.photoPage.create({
      data: {
        projectId,
        title: `Inspection Report - ${new Date().toLocaleDateString()}`,
        content: report,
        pageType: 'REPORT',
        pageNumber: 999, // Put at end
        createdById: options.userId,
      },
    });

    logger.info(`Generated inspection report ${reportPage.id}`);
    return { report, pageId: reportPage.id };
  } catch (error) {
    logger.error('Report generation failed:', error);
    throw error;
  }
}

/**
 * Generate daily work log from photos uploaded today
 */
export async function generateDailyLog(projectId, date, userId) {
  logger.info(`Generating daily log for project ${projectId} on ${date}`);

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const photos = await prisma.photo.findMany({
    where: {
      projectId,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (photos.length === 0) {
    return { message: 'No photos found for this date', log: null };
  }

  const apiKey = await getOpenAIKey();

  const photoDetails = photos
    .map((p, idx) => `${idx + 1}. ${p.type || 'Photo'} at ${p.createdAt.toLocaleTimeString()}: ${p.aiDescription || p.caption || 'No description'}`)
    .join('\n');

  const prompt = `Generate a professional daily work log based on these photos taken on ${startOfDay.toLocaleDateString()}:

${photoDetails}

Create a concise daily log entry that:
1. Summarizes work completed
2. Notes any progress or milestones
3. Highlights any issues observed
4. Suggests next steps

Keep it professional and suitable for project documentation.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a construction project documentation assistant.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const log = data.choices?.[0]?.message?.content?.trim();

    // Save as a page
    const logPage = await prisma.photoPage.create({
      data: {
        projectId,
        title: `Daily Log - ${startOfDay.toLocaleDateString()}`,
        content: log,
        pageType: 'DAILY_LOG',
        pageNumber: 1000 + Math.floor(Date.now() / 86400000), // Unique ordering
        createdById: userId,
      },
    });

    return { log, pageId: logPage.id };
  } catch (error) {
    logger.error('Daily log generation failed:', error);
    throw error;
  }
}

/**
 * Generate checklist from voice transcription
 */
export async function generateChecklistFromVoice(projectId, audioTranscript, userId) {
  logger.info(`Generating checklist from voice for project ${projectId}`);

  const apiKey = await getOpenAIKey();

  const prompt = `Convert this voice description into a structured checklist for a construction/roofing project:

"${audioTranscript}"

Generate a JSON checklist with this structure:
{
  "name": "Checklist name based on content",
  "description": "Brief description",
  "sections": [
    {
      "name": "Section name",
      "items": [
        {
          "label": "Item to check/complete",
          "fieldType": "NOTES" or "YES_NO" or "RATING" or "REQUIRED_PHOTO",
          "isRequired": true/false
        }
      ]
    }
  ]
}

Return ONLY valid JSON, no markdown or explanation.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a construction checklist generator. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.5,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    // Parse JSON from response
    const checklistData = JSON.parse(content);

    // Use dynamic import to avoid circular dependency
    const { checklistService } = await import('./checklistService.js');

    // Create the checklist
    const checklist = await checklistService.createChecklist(projectId, checklistData, userId);

    return { checklist };
  } catch (error) {
    logger.error('Voice checklist generation failed:', error);
    throw error;
  }
}

/**
 * Extract text from document image using Textract
 */
export async function extractDocumentText(photoId) {
  logger.info(`Extracting text from document ${photoId}`);

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
  });

  if (!photo) {
    const error = new Error('Photo not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const s3Key = extractS3Key(photo.originalUrl);
  const bucket = process.env.S3_BUCKET || 'pandacam-photos-prod';

  try {
    const command = new AnalyzeDocumentCommand({
      Document: {
        S3Object: {
          Bucket: bucket,
          Name: s3Key,
        },
      },
      FeatureTypes: ['FORMS', 'TABLES'],
    });

    const response = await textractClient.send(command);

    // Extract text blocks
    const textBlocks = response.Blocks
      .filter((b) => b.BlockType === 'LINE')
      .map((b) => b.Text);

    // Extract key-value pairs (forms)
    const keyValues = {};
    const keyMap = {};
    const valueMap = {};

    response.Blocks.forEach((block) => {
      if (block.BlockType === 'KEY_VALUE_SET') {
        if (block.EntityTypes?.includes('KEY')) {
          keyMap[block.Id] = block;
        } else if (block.EntityTypes?.includes('VALUE')) {
          valueMap[block.Id] = block;
        }
      }
    });

    // Update photo with extracted text
    await prisma.photo.update({
      where: { id: photoId },
      data: {
        detectedText: textBlocks,
        extractedData: { textBlocks, keyValues },
      },
    });

    return { textBlocks, keyValues };
  } catch (error) {
    logger.error('Document text extraction failed:', error);
    throw error;
  }
}

/**
 * Assess photo quality
 */
export async function assessPhotoQuality(photoId) {
  logger.info(`Assessing quality of photo ${photoId}`);

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
  });

  if (!photo) {
    const error = new Error('Photo not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Basic quality checks based on metadata
  const quality = {
    score: 100,
    issues: [],
  };

  // Check if we have dimensions
  if (photo.metadata) {
    const meta = typeof photo.metadata === 'string' ? JSON.parse(photo.metadata) : photo.metadata;

    // Resolution check
    if (meta.width && meta.height) {
      const megapixels = (meta.width * meta.height) / 1000000;
      if (megapixels < 2) {
        quality.score -= 20;
        quality.issues.push('Low resolution image');
      }
    }
  }

  // Could add more ML-based quality checks here

  return quality;
}

/**
 * Helper to extract S3 key from URL
 */
function extractS3Key(url) {
  if (!url) return null;

  // Handle CloudFront or S3 URLs
  try {
    const urlObj = new URL(url);
    // Remove leading slash
    return urlObj.pathname.substring(1);
  } catch {
    return url;
  }
}

export const aiService = {
  analyzePhoto,
  generatePhotoDescription,
  generateInspectionReport,
  generateDailyLog,
  generateChecklistFromVoice,
  extractDocumentText,
  assessPhotoQuality,
};

export default aiService;
