import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createCanvas } from 'canvas';
import sharp from 'sharp';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure PDF.js worker
const require = createRequire(import.meta.url);
const pdfjsWorker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

// S3 Configuration
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const BUCKET_NAME = process.env.S3_BUCKET || 'panda-crm-documents';
const THUMBNAIL_PREFIX = 'thumbnails';

// Thumbnail settings
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;

/**
 * Generate a thumbnail for a PDF document
 * @param {Buffer|ArrayBuffer} pdfBuffer - The PDF file buffer
 * @param {string} documentId - The document ID for naming the thumbnail
 * @returns {Promise<{thumbnailUrl: string, thumbnailKey: string}>}
 */
export async function generatePdfThumbnail(pdfBuffer, documentId) {
  try {
    // Convert to Uint8Array if needed
    const pdfData = pdfBuffer instanceof ArrayBuffer
      ? new Uint8Array(pdfBuffer)
      : new Uint8Array(pdfBuffer.buffer || pdfBuffer);

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      useSystemFonts: true,
      standardFontDataUrl: path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/'),
    });

    const pdfDocument = await loadingTask.promise;

    // Get the first page
    const page = await pdfDocument.getPage(1);

    // Calculate scale to get desired thumbnail width
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = THUMBNAIL_WIDTH / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    // Create canvas
    const canvas = createCanvas(scaledViewport.width, scaledViewport.height);
    const context = canvas.getContext('2d');

    // Fill with white background
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: scaledViewport,
    };

    await page.render(renderContext).promise;

    // Convert canvas to PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');

    // Use sharp to convert to JPEG and compress
    const jpegBuffer = await sharp(pngBuffer)
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();

    // Generate S3 key for the thumbnail
    const thumbnailKey = `${THUMBNAIL_PREFIX}/${documentId}.jpg`;

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: thumbnailKey,
      Body: jpegBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=31536000', // Cache for 1 year
    }));

    // Generate the public URL
    const thumbnailUrl = `https://${BUCKET_NAME}.s3.us-east-2.amazonaws.com/${thumbnailKey}`;

    // Clean up
    await pdfDocument.destroy();

    return {
      thumbnailUrl,
      thumbnailKey,
    };
  } catch (error) {
    console.error('[thumbnailService] Error generating PDF thumbnail:', error);
    throw error;
  }
}

/**
 * Generate a thumbnail from an S3 document URL
 * @param {string} s3Url - The S3 URL of the document
 * @param {string} documentId - The document ID
 * @returns {Promise<{thumbnailUrl: string, thumbnailKey: string}>}
 */
export async function generateThumbnailFromS3Url(s3Url, documentId) {
  try {
    // Extract bucket/key from common S3 URL formats
    const { bucket, key } = parseS3Url(s3Url);
    if (!bucket || !key) {
      throw new Error(`Invalid S3 URL format: ${s3Url}`);
    }

    // Fetch the document from S3
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: decodeURIComponent(key),
    }));

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    // Generate thumbnail
    return await generatePdfThumbnail(pdfBuffer, documentId);
  } catch (error) {
    console.error('[thumbnailService] Error generating thumbnail from S3 URL:', error);
    throw error;
  }
}

function parseS3Url(s3Url) {
  try {
    const url = new URL(s3Url);
    const host = url.hostname;
    const pathname = url.pathname.replace(/^\/+/, '');

    // Virtual-hosted-style:
    // bucket.s3.amazonaws.com/key
    // bucket.s3.us-east-2.amazonaws.com/key
    const virtualHostMatch = host.match(/^([^.]+)\.s3(?:[.-][^.]+)?\.amazonaws\.com$/);
    if (virtualHostMatch) {
      return { bucket: virtualHostMatch[1], key: pathname };
    }

    // Path-style:
    // s3.amazonaws.com/bucket/key
    // s3.us-east-2.amazonaws.com/bucket/key
    const pathStyleMatch = host.match(/^s3(?:[.-][^.]+)?\.amazonaws\.com$/);
    if (pathStyleMatch) {
      const [bucket, ...rest] = pathname.split('/');
      return { bucket, key: rest.join('/') };
    }
  } catch (error) {
    return { bucket: null, key: null };
  }

  return { bucket: null, key: null };
}

/**
 * Generate a thumbnail for an image file (non-PDF)
 * @param {Buffer} imageBuffer - The image file buffer
 * @param {string} documentId - The document ID
 * @returns {Promise<{thumbnailUrl: string, thumbnailKey: string}>}
 */
export async function generateImageThumbnail(imageBuffer, documentId) {
  try {
    // Use sharp to resize and convert to JPEG
    const jpegBuffer = await sharp(imageBuffer)
      .resize(THUMBNAIL_WIDTH, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();

    // Generate S3 key for the thumbnail
    const thumbnailKey = `${THUMBNAIL_PREFIX}/${documentId}.jpg`;

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: thumbnailKey,
      Body: jpegBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=31536000',
    }));

    // Generate the public URL
    const thumbnailUrl = `https://${BUCKET_NAME}.s3.us-east-2.amazonaws.com/${thumbnailKey}`;

    return {
      thumbnailUrl,
      thumbnailKey,
    };
  } catch (error) {
    console.error('[thumbnailService] Error generating image thumbnail:', error);
    throw error;
  }
}

/**
 * Determine if a file type can have a thumbnail generated
 * @param {string} fileType - MIME type or file extension
 * @returns {boolean}
 */
export function canGenerateThumbnail(fileType) {
  if (!fileType) return false;

  const supportedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
  ];

  const lowerType = fileType.toLowerCase();
  return supportedTypes.some(type => lowerType.includes(type) || lowerType.endsWith(type.split('/')[1]));
}

/**
 * Check if a file is a PDF
 * @param {string} fileType - MIME type or file extension
 * @param {string} fileName - Optional file name to check extension
 * @returns {boolean}
 */
export function isPdf(fileType, fileName) {
  if (fileType && fileType.toLowerCase().includes('pdf')) return true;
  if (fileName && fileName.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

/**
 * Check if a file is an image
 * @param {string} fileType - MIME type or file extension
 * @param {string} fileName - Optional file name to check extension
 * @returns {boolean}
 */
export function isImage(fileType, fileName) {
  const imageTypes = ['image/', 'jpeg', 'jpg', 'png', 'gif', 'webp', 'tiff'];
  const lowerType = (fileType || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();

  return imageTypes.some(type =>
    lowerType.includes(type) ||
    lowerName.endsWith(`.${type}`)
  );
}

export default {
  generatePdfThumbnail,
  generateThumbnailFromS3Url,
  generateImageThumbnail,
  canGenerateThumbnail,
  isPdf,
  isImage,
};
