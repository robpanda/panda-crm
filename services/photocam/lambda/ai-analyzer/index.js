// PandaCam AI Analyzer Lambda
// Analyzes photos using AWS Rekognition for auto-tagging
// Can be triggered via EventBridge or direct invocation

import {
  RekognitionClient,
  DetectLabelsCommand,
  DetectTextCommand,
} from '@aws-sdk/client-rekognition';

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

const BUCKET_NAME = process.env.S3_BUCKET || 'pandacam-photos-prod';
const MIN_CONFIDENCE = 70;
const MAX_LABELS = 20;

// Construction/roofing specific labels to prioritize
const PRIORITY_LABELS = [
  'roof', 'shingle', 'gutter', 'siding', 'window', 'door', 'chimney',
  'damage', 'crack', 'leak', 'mold', 'rust', 'dent', 'hole',
  'construction', 'tool', 'ladder', 'scaffold', 'tarp', 'debris',
  'before', 'after', 'progress', 'installation', 'repair',
  'flashing', 'vent', 'skylight', 'fascia', 'soffit', 'trim',
];

export const handler = async (event) => {
  console.log('AI Analyzer event:', JSON.stringify(event, null, 2));

  // Support multiple invocation methods
  const photos = event.photos || [event];

  const results = [];

  for (const photo of photos) {
    try {
      const { photoId, s3Key, bucket = BUCKET_NAME } = photo;

      if (!photoId || !s3Key) {
        console.warn('Missing photoId or s3Key, skipping');
        continue;
      }

      console.log(`Analyzing photo ${photoId}: ${s3Key}`);

      const analysisResult = {
        photoId,
        labels: [],
        detectedText: [],
        constructionLabels: [],
        confidence: 0,
      };

      // Detect labels (objects, scenes)
      try {
        const labelsCommand = new DetectLabelsCommand({
          Image: {
            S3Object: {
              Bucket: bucket,
              Name: s3Key,
            },
          },
          MaxLabels: MAX_LABELS,
          MinConfidence: MIN_CONFIDENCE,
        });

        const labelsResponse = await rekognitionClient.send(labelsCommand);

        analysisResult.labels = labelsResponse.Labels.map((label) => ({
          name: label.Name,
          confidence: Math.round(label.Confidence * 100) / 100,
          categories: label.Categories?.map((c) => c.Name) || [],
          parents: label.Parents?.map((p) => p.Name) || [],
        }));

        // Extract construction-specific labels
        analysisResult.constructionLabels = analysisResult.labels
          .filter((label) =>
            PRIORITY_LABELS.some((p) =>
              label.name.toLowerCase().includes(p.toLowerCase())
            )
          )
          .map((label) => label.name);

        // Calculate overall confidence
        if (analysisResult.labels.length > 0) {
          analysisResult.confidence =
            analysisResult.labels.reduce((sum, l) => sum + l.confidence, 0) /
            analysisResult.labels.length;
        }

      } catch (labelError) {
        console.error('Label detection failed:', labelError.message);
        analysisResult.labelError = labelError.message;
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

        // Only get LINE type text (not individual words)
        analysisResult.detectedText = textResponse.TextDetections
          .filter((t) => t.Type === 'LINE' && t.Confidence >= MIN_CONFIDENCE)
          .map((t) => ({
            text: t.DetectedText,
            confidence: Math.round(t.Confidence * 100) / 100,
          }));

      } catch (textError) {
        console.error('Text detection failed:', textError.message);
        analysisResult.textError = textError.message;
      }

      // Categorize the photo based on detected labels
      analysisResult.suggestedCategory = categorizePhoto(analysisResult.labels);
      analysisResult.suggestedTags = generateTags(analysisResult);

      // Call API to update photo with AI analysis
      const apiEndpoint = process.env.PHOTOCAM_API_ENDPOINT;
      if (apiEndpoint) {
        try {
          const updateResponse = await fetch(`${apiEndpoint}/photos/${photoId}/ai-analysis`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Lambda-Secret': process.env.LAMBDA_SECRET || '',
            },
            body: JSON.stringify({
              aiLabels: analysisResult.labels,
              detectedText: analysisResult.detectedText.map((t) => t.text),
              suggestedCategory: analysisResult.suggestedCategory,
              suggestedTags: analysisResult.suggestedTags,
              aiProcessedAt: new Date().toISOString(),
            }),
          });

          if (!updateResponse.ok) {
            console.error('Failed to update photo via API:', await updateResponse.text());
          }
        } catch (apiError) {
          console.error('API call failed:', apiError.message);
        }
      }

      results.push({
        photoId,
        status: 'success',
        ...analysisResult,
      });

    } catch (error) {
      console.error(`Error analyzing photo:`, error);
      results.push({
        photoId: photo.photoId,
        status: 'error',
        error: error.message,
      });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'AI analysis complete',
      results,
    }),
  };
};

/**
 * Categorize photo based on detected labels
 */
function categorizePhoto(labels) {
  const labelNames = labels.map((l) => l.name.toLowerCase());

  // Check for before/after indicators
  if (labelNames.some((n) => n.includes('damage') || n.includes('broken') || n.includes('old'))) {
    return 'BEFORE';
  }
  if (labelNames.some((n) => n.includes('new') || n.includes('clean') || n.includes('finished'))) {
    return 'AFTER';
  }

  // Check for specific construction elements
  if (labelNames.some((n) => n.includes('roof') || n.includes('shingle'))) {
    return 'ROOF';
  }
  if (labelNames.some((n) => n.includes('gutter'))) {
    return 'GUTTERS';
  }
  if (labelNames.some((n) => n.includes('siding'))) {
    return 'SIDING';
  }
  if (labelNames.some((n) => n.includes('window'))) {
    return 'WINDOWS';
  }

  // Check for damage indicators
  if (labelNames.some((n) =>
    n.includes('damage') || n.includes('crack') || n.includes('hole') ||
    n.includes('leak') || n.includes('rust') || n.includes('mold')
  )) {
    return 'DAMAGE';
  }

  // Check for progress/work indicators
  if (labelNames.some((n) =>
    n.includes('construction') || n.includes('tool') || n.includes('worker') ||
    n.includes('scaffold') || n.includes('ladder')
  )) {
    return 'PROGRESS';
  }

  return 'GENERAL';
}

/**
 * Generate suggested tags based on analysis
 */
function generateTags(analysis) {
  const tags = new Set();

  // Add construction-specific labels
  analysis.constructionLabels.forEach((label) => {
    tags.add(label.toLowerCase());
  });

  // Add category as tag
  if (analysis.suggestedCategory) {
    tags.add(analysis.suggestedCategory.toLowerCase());
  }

  // Add high-confidence labels (> 90%)
  analysis.labels
    .filter((l) => l.confidence > 90)
    .slice(0, 5)
    .forEach((l) => tags.add(l.name.toLowerCase()));

  return Array.from(tags).slice(0, 10);
}
