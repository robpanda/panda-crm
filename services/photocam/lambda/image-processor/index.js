// PandaCam Image Processor Lambda
// Triggered on S3 PUT to /originals/ folder
// Creates display (2048px) and thumbnail (400px) versions

import sharp from 'sharp';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import exifr from 'exifr';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-2' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DISPLAY_MAX_SIZE = 2048;
const THUMBNAIL_SIZE = 400;
const JPEG_QUALITY = 85;

export const handler = async (event) => {
  console.log('Processing S3 event:', JSON.stringify(event, null, 2));

  const results = [];

  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      // Only process files in /originals/ folder
      if (!key.includes('/originals/')) {
        console.log(`Skipping non-original file: ${key}`);
        continue;
      }

      console.log(`Processing: ${bucket}/${key}`);

      // Get the original image from S3
      const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3Client.send(getCommand);
      const imageBuffer = Buffer.from(await response.Body.transformToByteArray());

      // Parse the key to extract projectId, photoId, filename
      // Format: {projectId}/originals/{photoId}/{filename}
      const keyParts = key.split('/');
      const projectId = keyParts[0];
      const photoId = keyParts[2];
      const filename = keyParts[3];
      const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');

      // Extract EXIF metadata
      let metadata = {};
      try {
        const exifData = await exifr.parse(imageBuffer, {
          pick: ['Make', 'Model', 'DateTimeOriginal', 'GPSLatitude', 'GPSLongitude',
                 'ImageWidth', 'ImageHeight', 'Orientation', 'ExposureTime',
                 'FNumber', 'ISO', 'FocalLength'],
        });
        if (exifData) {
          metadata = {
            camera: exifData.Make && exifData.Model ? `${exifData.Make} ${exifData.Model}` : null,
            takenAt: exifData.DateTimeOriginal || null,
            gps: exifData.GPSLatitude && exifData.GPSLongitude ? {
              latitude: exifData.GPSLatitude,
              longitude: exifData.GPSLongitude,
            } : null,
            dimensions: {
              width: exifData.ImageWidth,
              height: exifData.ImageHeight,
            },
            orientation: exifData.Orientation,
            exposure: {
              time: exifData.ExposureTime,
              fNumber: exifData.FNumber,
              iso: exifData.ISO,
              focalLength: exifData.FocalLength,
            },
          };
        }
      } catch (exifError) {
        console.warn('EXIF extraction failed:', exifError.message);
      }

      // Get image dimensions
      const originalImage = sharp(imageBuffer);
      const originalMetadata = await originalImage.metadata();
      metadata.dimensions = metadata.dimensions || {
        width: originalMetadata.width,
        height: originalMetadata.height,
      };

      // Create display version (max 2048px on longest side)
      const displayBuffer = await sharp(imageBuffer)
        .resize(DISPLAY_MAX_SIZE, DISPLAY_MAX_SIZE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      const displayKey = `${projectId}/display/${photoId}/${filenameWithoutExt}.jpg`;
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: displayKey,
        Body: displayBuffer,
        ContentType: 'image/jpeg',
        Metadata: { photoId, variant: 'display' },
      }));
      console.log(`Created display version: ${displayKey}`);

      // Create thumbnail (400px)
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      const thumbnailKey = `${projectId}/thumbnails/${photoId}/${filenameWithoutExt}.jpg`;
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg',
        Metadata: { photoId, variant: 'thumbnail' },
      }));
      console.log(`Created thumbnail: ${thumbnailKey}`);

      // Update the photo record in the database via API call
      // (Lambda will call the photocam service API to update)
      const cdnUrl = process.env.CDN_URL || `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com`;

      const updatePayload = {
        photoId,
        displayUrl: `${cdnUrl}/${displayKey}`,
        thumbnailUrl: `${cdnUrl}/${thumbnailKey}`,
        metadata,
        processedAt: new Date().toISOString(),
      };

      // If API endpoint is configured, call it to update the photo record
      const apiEndpoint = process.env.PHOTOCAM_API_ENDPOINT;
      if (apiEndpoint) {
        try {
          const updateResponse = await fetch(`${apiEndpoint}/photos/${photoId}/processing-complete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Lambda-Secret': process.env.LAMBDA_SECRET || '',
            },
            body: JSON.stringify(updatePayload),
          });

          if (!updateResponse.ok) {
            console.error('Failed to update photo record via API:', await updateResponse.text());
          }
        } catch (apiError) {
          console.error('API call failed:', apiError.message);
        }
      }

      results.push({
        key,
        status: 'success',
        displayKey,
        thumbnailKey,
        metadata,
      });

    } catch (error) {
      console.error(`Error processing ${record.s3.object.key}:`, error);
      results.push({
        key: record.s3.object.key,
        status: 'error',
        error: error.message,
      });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Image processing complete',
      results,
    }),
  };
};
