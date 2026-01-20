// PandaCam Comparison Generator Lambda
// Generates before/after comparison images with various layouts
// Triggered via API or EventBridge

import sharp from 'sharp';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

const BUCKET_NAME = process.env.S3_BUCKET || 'pandacam-photos-prod';
const OUTPUT_SIZE = 2048; // Max output dimension
const JPEG_QUALITY = 90;

// Layout types for before/after comparisons
const LAYOUTS = {
  SIDE_BY_SIDE: 'side_by_side',
  VERTICAL: 'vertical',
  SLIDER: 'slider',
  DIAGONAL: 'diagonal',
  OVERLAY: 'overlay',
};

export const handler = async (event) => {
  console.log('Comparison Generator event:', JSON.stringify(event, null, 2));

  const {
    comparisonId,
    projectId,
    beforePhotoKey,
    afterPhotoKey,
    layout = LAYOUTS.SIDE_BY_SIDE,
    options = {},
  } = event;

  if (!comparisonId || !projectId || !beforePhotoKey || !afterPhotoKey) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing required fields: comparisonId, projectId, beforePhotoKey, afterPhotoKey',
      }),
    };
  }

  try {
    // Fetch both images from S3
    const [beforeBuffer, afterBuffer] = await Promise.all([
      fetchImageFromS3(beforePhotoKey),
      fetchImageFromS3(afterPhotoKey),
    ]);

    // Get metadata for sizing
    const [beforeMeta, afterMeta] = await Promise.all([
      sharp(beforeBuffer).metadata(),
      sharp(afterBuffer).metadata(),
    ]);

    console.log(`Before image: ${beforeMeta.width}x${beforeMeta.height}`);
    console.log(`After image: ${afterMeta.width}x${afterMeta.height}`);

    // Generate comparison based on layout
    let compositeBuffer;
    switch (layout) {
      case LAYOUTS.VERTICAL:
        compositeBuffer = await createVerticalComparison(beforeBuffer, afterBuffer, options);
        break;
      case LAYOUTS.SLIDER:
        compositeBuffer = await createSliderComparison(beforeBuffer, afterBuffer, options);
        break;
      case LAYOUTS.DIAGONAL:
        compositeBuffer = await createDiagonalComparison(beforeBuffer, afterBuffer, options);
        break;
      case LAYOUTS.OVERLAY:
        compositeBuffer = await createOverlayComparison(beforeBuffer, afterBuffer, options);
        break;
      case LAYOUTS.SIDE_BY_SIDE:
      default:
        compositeBuffer = await createSideBySideComparison(beforeBuffer, afterBuffer, options);
        break;
    }

    // Add labels if requested
    if (options.addLabels !== false) {
      compositeBuffer = await addLabels(compositeBuffer, layout, options);
    }

    // Add branding if logo provided
    if (options.logoKey) {
      compositeBuffer = await addBranding(compositeBuffer, options.logoKey);
    }

    // Upload to S3
    const outputKey = `${projectId}/comparisons/${comparisonId}/${layout}.jpg`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: outputKey,
      Body: compositeBuffer,
      ContentType: 'image/jpeg',
      Metadata: {
        comparisonId,
        layout,
        beforePhoto: beforePhotoKey,
        afterPhoto: afterPhotoKey,
      },
    }));

    console.log(`Created comparison: ${outputKey}`);

    // Update comparison record via API
    const apiEndpoint = process.env.PHOTOCAM_API_ENDPOINT;
    if (apiEndpoint) {
      try {
        const cdnUrl = process.env.CDN_URL || `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com`;
        const updateResponse = await fetch(`${apiEndpoint}/comparisons/${comparisonId}/generation-complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Lambda-Secret': process.env.LAMBDA_SECRET || '',
          },
          body: JSON.stringify({
            layout,
            imageUrl: `${cdnUrl}/${outputKey}`,
            generatedAt: new Date().toISOString(),
          }),
        });

        if (!updateResponse.ok) {
          console.error('Failed to update comparison via API:', await updateResponse.text());
        }
      } catch (apiError) {
        console.error('API call failed:', apiError.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        comparisonId,
        outputKey,
        layout,
      }),
    };

  } catch (error) {
    console.error('Error generating comparison:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        comparisonId,
      }),
    };
  }
};

/**
 * Fetch image from S3 and return as buffer
 */
async function fetchImageFromS3(key) {
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }));
  return Buffer.from(await response.Body.transformToByteArray());
}

/**
 * Create side-by-side horizontal comparison
 */
async function createSideBySideComparison(beforeBuffer, afterBuffer, options) {
  const halfWidth = Math.floor(OUTPUT_SIZE / 2);
  const gap = options.gap || 4;

  // Resize both images to fit in half the width
  const [beforeResized, afterResized] = await Promise.all([
    sharp(beforeBuffer)
      .resize(halfWidth - gap, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
    sharp(afterBuffer)
      .resize(halfWidth - gap, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
  ]);

  // Get resized dimensions
  const [beforeMeta, afterMeta] = await Promise.all([
    sharp(beforeResized).metadata(),
    sharp(afterResized).metadata(),
  ]);

  // Calculate total dimensions
  const totalWidth = beforeMeta.width + afterMeta.width + gap;
  const totalHeight = Math.max(beforeMeta.height, afterMeta.height);

  // Create composite
  return sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: beforeResized, left: 0, top: Math.floor((totalHeight - beforeMeta.height) / 2) },
      { input: afterResized, left: beforeMeta.width + gap, top: Math.floor((totalHeight - afterMeta.height) / 2) },
    ])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Create vertical (stacked) comparison
 */
async function createVerticalComparison(beforeBuffer, afterBuffer, options) {
  const gap = options.gap || 4;

  // Resize both images to fit in the output width
  const [beforeResized, afterResized] = await Promise.all([
    sharp(beforeBuffer)
      .resize(OUTPUT_SIZE, Math.floor(OUTPUT_SIZE / 2) - gap, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
    sharp(afterBuffer)
      .resize(OUTPUT_SIZE, Math.floor(OUTPUT_SIZE / 2) - gap, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
  ]);

  // Get resized dimensions
  const [beforeMeta, afterMeta] = await Promise.all([
    sharp(beforeResized).metadata(),
    sharp(afterResized).metadata(),
  ]);

  // Calculate total dimensions
  const totalWidth = Math.max(beforeMeta.width, afterMeta.width);
  const totalHeight = beforeMeta.height + afterMeta.height + gap;

  // Create composite
  return sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: beforeResized, left: Math.floor((totalWidth - beforeMeta.width) / 2), top: 0 },
      { input: afterResized, left: Math.floor((totalWidth - afterMeta.width) / 2), top: beforeMeta.height + gap },
    ])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Create slider-style comparison (before on left, after on right with vertical divider)
 */
async function createSliderComparison(beforeBuffer, afterBuffer, options) {
  const dividerPosition = options.dividerPosition || 0.5; // 0-1, where to place divider

  // Resize both to same dimensions
  const [beforeResized, afterResized] = await Promise.all([
    sharp(beforeBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .toBuffer(),
    sharp(afterBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .toBuffer(),
  ]);

  const meta = await sharp(beforeResized).metadata();
  const dividerX = Math.floor(meta.width * dividerPosition);

  // Extract left portion of before image
  const beforeLeft = await sharp(beforeResized)
    .extract({ left: 0, top: 0, width: dividerX, height: meta.height })
    .toBuffer();

  // Extract right portion of after image
  const afterRight = await sharp(afterResized)
    .extract({ left: dividerX, top: 0, width: meta.width - dividerX, height: meta.height })
    .toBuffer();

  // Create divider line
  const dividerWidth = 4;
  const divider = await sharp({
    create: {
      width: dividerWidth,
      height: meta.height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).png().toBuffer();

  // Composite
  return sharp({
    create: {
      width: meta.width,
      height: meta.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      { input: beforeLeft, left: 0, top: 0 },
      { input: afterRight, left: dividerX, top: 0 },
      { input: divider, left: dividerX - Math.floor(dividerWidth / 2), top: 0 },
    ])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Create diagonal split comparison
 */
async function createDiagonalComparison(beforeBuffer, afterBuffer, options) {
  // Resize both to same dimensions
  const [beforeResized, afterResized] = await Promise.all([
    sharp(beforeBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .toBuffer(),
    sharp(afterBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .toBuffer(),
  ]);

  const meta = await sharp(beforeResized).metadata();

  // Create diagonal mask SVG
  const maskSvg = `
    <svg width="${meta.width}" height="${meta.height}">
      <polygon points="0,0 ${meta.width},0 0,${meta.height}" fill="white"/>
    </svg>
  `;

  // Apply mask to before image (top-left triangle)
  const beforeMasked = await sharp(beforeResized)
    .composite([{
      input: Buffer.from(maskSvg),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  // Composite before triangle over after image
  return sharp(afterResized)
    .composite([{ input: beforeMasked, left: 0, top: 0 }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Create overlay/fade comparison
 */
async function createOverlayComparison(beforeBuffer, afterBuffer, options) {
  const opacity = options.opacity || 0.5;

  // Resize both to same dimensions
  const [beforeResized, afterResized] = await Promise.all([
    sharp(beforeBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .toBuffer(),
    sharp(afterBuffer)
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'inside', withoutEnlargement: true })
      .toBuffer(),
  ]);

  // Composite after over before with opacity
  return sharp(beforeResized)
    .composite([{
      input: afterResized,
      blend: 'over',
      opacity: opacity,
    }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Add BEFORE/AFTER labels to the comparison
 */
async function addLabels(imageBuffer, layout, options) {
  const meta = await sharp(imageBuffer).metadata();
  const fontSize = options.fontSize || 48;
  const labelColor = options.labelColor || '#ffffff';
  const bgColor = options.labelBgColor || 'rgba(0,0,0,0.6)';

  let labelsSvg;

  if (layout === LAYOUTS.VERTICAL) {
    // Labels at top of each image
    const quarterHeight = Math.floor(meta.height / 4);
    labelsSvg = `
      <svg width="${meta.width}" height="${meta.height}">
        <rect x="10" y="10" width="180" height="50" rx="6" fill="${bgColor}"/>
        <text x="100" y="45" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${labelColor}" text-anchor="middle">BEFORE</text>
        <rect x="10" y="${meta.height / 2 + 10}" width="160" height="50" rx="6" fill="${bgColor}"/>
        <text x="90" y="${meta.height / 2 + 45}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${labelColor}" text-anchor="middle">AFTER</text>
      </svg>
    `;
  } else {
    // Side by side - labels at bottom corners
    const halfWidth = Math.floor(meta.width / 2);
    labelsSvg = `
      <svg width="${meta.width}" height="${meta.height}">
        <rect x="10" y="${meta.height - 60}" width="180" height="50" rx="6" fill="${bgColor}"/>
        <text x="100" y="${meta.height - 25}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${labelColor}" text-anchor="middle">BEFORE</text>
        <rect x="${halfWidth + 10}" y="${meta.height - 60}" width="160" height="50" rx="6" fill="${bgColor}"/>
        <text x="${halfWidth + 90}" y="${meta.height - 25}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${labelColor}" text-anchor="middle">AFTER</text>
      </svg>
    `;
  }

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(labelsSvg), top: 0, left: 0 }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Add company branding/logo
 */
async function addBranding(imageBuffer, logoKey) {
  try {
    const logoBuffer = await fetchImageFromS3(logoKey);
    const meta = await sharp(imageBuffer).metadata();

    // Resize logo to fit in corner (max 200px wide)
    const logoResized = await sharp(logoBuffer)
      .resize(200, 80, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();

    const logoMeta = await sharp(logoResized).metadata();

    // Position in bottom-right corner with padding
    const padding = 20;
    const left = meta.width - logoMeta.width - padding;
    const top = meta.height - logoMeta.height - padding;

    return sharp(imageBuffer)
      .composite([{ input: logoResized, left, top }])
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (error) {
    console.warn('Failed to add branding:', error.message);
    return imageBuffer;
  }
}
