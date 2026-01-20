// EagleView, GAF QuickMeasure, Hover & gSquare Integration Service
// Handles ordering, receiving, and processing measurement reports
// Also supports Hover 3D modeling, design visualization, and ML-based measurements
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// S3 configuration for document storage
const S3_BUCKET = process.env.MEASUREMENT_DOCS_BUCKET || 'panda-crm-measurement-docs';
const S3_REGION = process.env.AWS_REGION || 'us-east-2';
const s3Client = new S3Client({ region: S3_REGION });
const lambdaClient = new LambdaClient({ region: S3_REGION });

// ==========================================
// EagleView API Configuration (OAuth2)
// ==========================================
const EAGLEVIEW_TOKEN_URL = process.env.EAGLEVIEW_TOKEN_URL || 'https://apicenter.eagleview.com/oauth2/v1/token';
const EAGLEVIEW_API_BASE = process.env.EAGLEVIEW_API_URL || 'https://apicenter.eagleview.com/v2';
const EAGLEVIEW_CLIENT_ID = process.env.EAGLEVIEW_CLIENT_ID;
const EAGLEVIEW_CLIENT_SECRET = process.env.EAGLEVIEW_CLIENT_SECRET;

// ==========================================
// GAF QuickMeasure API Configuration (OAuth2)
// ==========================================
const GAF_TOKEN_URL = process.env.GAF_TOKEN_URL || 'https://ssoext.gaf.com/oauth2/ausclyogeZBNESNcI4x6/v1/token';
const GAF_API_BASE = process.env.GAF_API_URL || 'https://gafapis.gaf.com/partner/PAN';
const GAF_CLIENT_ID = process.env.GAF_CLIENT_ID;
const GAF_CLIENT_SECRET = process.env.GAF_CLIENT_SECRET;
const GAF_AUDIENCE = process.env.GAF_AUDIENCE || 'https://quickmeasureapi.gaf.com';
const GAF_SCOPE = process.env.GAF_SCOPE || 'Subscriber:GetSubscriberDetails Subscriber:SiteStatus Subscriber:AccountCheck Subscriber:CoverageCheck Subscriber:OrderHistory Subscriber:OrderSearch Subscriber:Order Subscriber:Download';

// ==========================================
// Hover API Configuration (OAuth2 Authorization Code Flow)
// ==========================================
const HOVER_API_BASE = process.env.HOVER_API_URL || 'https://hover.to/api/v2';
const HOVER_OAUTH_URL = process.env.HOVER_OAUTH_URL || 'https://hover.to/oauth';
const HOVER_CLIENT_ID = process.env.HOVER_CLIENT_ID;
const HOVER_CLIENT_SECRET = process.env.HOVER_CLIENT_SECRET;
const HOVER_REDIRECT_URI = process.env.HOVER_REDIRECT_URI || 'https://crm.pandaadmin.com/api/integrations/measurements/hover/callback';

// ==========================================
// OpenTopography API Configuration (API Key)
// Provides access to USGS 3DEP LiDAR/DEM data
// ==========================================
const OPENTOPOGRAPHY_API_BASE = 'https://portal.opentopography.org/API';
const OPENTOPOGRAPHY_API_KEY = process.env.OPENTOPOGRAPHY_API_KEY || 'da9c1f8476ef69d6842082420c299745';

// ==========================================
// Google Solar API Configuration
// Provides building insights, roof segments, solar potential
// ==========================================
const GOOGLE_SOLAR_API_BASE = 'https://solar.googleapis.com/v1';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_SOLAR_API_KEY || process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyDYWtN_izjZbVQaazwNykvyv3YAe6Rs7c4';

// ==========================================
// gSquare API Configuration (High-Resolution Oblique Imagery)
// Used for ML-based roof edge detection and measurements
// ==========================================
const GSQUARE_API_BASE = process.env.GSQUARE_API_URL || 'https://api.gsquare.io/v1';
const GSQUARE_API_KEY = process.env.GSQUARE_API_KEY;

// ==========================================
// Geospan gSquare API Configuration (High-Resolution Aerial Imagery)
// Provides instant roof area estimates with oblique imagery
// API Documentation: https://docs.geospan.com/gsquare/
// ==========================================
const GEOSPAN_API_BASE = process.env.GEOSPAN_API_URL || 'https://api.geospan.com/remote4d/v1/api';
// Geospan API key is fetched from AWS Secrets Manager (not environment variable)
let geospanApiKeyCache = null;

/**
 * Get Geospan API key from AWS Secrets Manager (cached)
 * Secret name: geospan-api-key
 */
async function getGeospanApiKey() {
  if (geospanApiKeyCache) return geospanApiKeyCache;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'geospan-api-key' })
    );
    const secret = JSON.parse(response.SecretString);
    geospanApiKeyCache = secret.apiKey;
    logger.info('Successfully retrieved Geospan API key from Secrets Manager');
    return geospanApiKeyCache;
  } catch (error) {
    logger.error('Failed to get Geospan API key from Secrets Manager:', error.message);
    // Fallback to environment variable if Secrets Manager fails
    if (process.env.GEOSPAN_API_KEY) {
      logger.warn('Falling back to GEOSPAN_API_KEY environment variable');
      return process.env.GEOSPAN_API_KEY;
    }
    throw new Error('Unable to retrieve Geospan API credentials');
  }
}

// ==========================================
// ML Roof Analysis Configuration (AWS Lambda/SageMaker)
// Custom ML pipeline for accurate linear measurements
// ==========================================
const ML_ROOF_LAMBDA_ARN = process.env.ML_ROOF_LAMBDA_ARN || 'arn:aws:lambda:us-east-2:679128292059:function:panda-roof-ml-analyzer';
const ML_ROOF_ENABLED = process.env.ML_ROOF_ENABLED === 'true';
const ML_ROOF_CONFIDENCE_THRESHOLD = parseFloat(process.env.ML_ROOF_CONFIDENCE_THRESHOLD || '0.75');

// ==========================================
// FREE NAIP-Based Roof Measurement Pipeline
// Uses free NAIP aerial imagery + custom CV segmentation
// No per-report cost - uses public domain imagery
// ==========================================
const NAIP_FETCHER_LAMBDA_ARN = process.env.NAIP_FETCHER_LAMBDA_ARN || 'arn:aws:lambda:us-east-2:679128292059:function:panda-naip-fetcher';
const ROOF_SEGMENTER_LAMBDA_ARN = process.env.ROOF_SEGMENTER_LAMBDA_ARN || 'arn:aws:lambda:us-east-2:679128292059:function:panda-roof-segmenter';
const MEASUREMENT_CALCULATOR_LAMBDA_ARN = process.env.MEASUREMENT_CALCULATOR_LAMBDA_ARN || 'arn:aws:lambda:us-east-2:679128292059:function:panda-measurement-calculator';
const REPORT_GENERATOR_LAMBDA_ARN = process.env.REPORT_GENERATOR_LAMBDA_ARN || 'arn:aws:lambda:us-east-2:679128292059:function:panda-report-generator';
const NAIP_PIPELINE_ENABLED = process.env.NAIP_PIPELINE_ENABLED === 'true';
const NAIP_CONFIDENCE_THRESHOLD = parseFloat(process.env.NAIP_CONFIDENCE_THRESHOLD || '0.60');

// Token caches to avoid repeated auth requests
let eagleViewTokenCache = { token: null, expiresAt: 0 };
let gafTokenCache = { token: null, expiresAt: 0 };
let hoverTokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 };

class MeasurementService {
  /**
   * Look up internal User ID from Cognito ID
   * Returns null if user not found (orderedById is optional)
   */
  async getUserIdFromCognitoId(cognitoId) {
    if (!cognitoId) return null;

    try {
      const user = await prisma.user.findUnique({
        where: { cognitoId },
        select: { id: true },
      });
      return user?.id || null;
    } catch (error) {
      logger.warn(`Could not find user for Cognito ID ${cognitoId}:`, error.message);
      return null;
    }
  }

  // ==========================================
  // EagleView Integration
  // ==========================================

  /**
   * Order a new EagleView report
   */
  async orderEagleViewReport(data) {
    const {
      opportunityId,
      address,
      city,
      state,
      zip,
      reportType = 'PREMIUM',
      userId,
    } = data;

    // Validate opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { account: true },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Look up internal user ID from Cognito ID (orderedById is optional)
    const orderedById = await this.getUserIdFromCognitoId(userId);

    try {
      // Create pending measurement report
      const report = await prisma.measurementReport.create({
        data: {
          provider: 'EAGLEVIEW',
          reportType,
          orderStatus: 'PENDING',
          propertyAddress: address || opportunity.street,
          propertyCity: city || opportunity.city,
          propertyState: state || opportunity.state,
          propertyZip: zip || opportunity.postalCode,
          opportunityId,
          accountId: opportunity.accountId,
          orderedById,
          orderedAt: new Date(),
        },
      });

      // Submit to EagleView API
      const eagleViewOrder = await this.submitEagleViewOrder({
        address: report.propertyAddress,
        city: report.propertyCity,
        state: report.propertyState,
        zip: report.propertyZip,
        reportType: this.mapReportType(reportType),
        referenceId: report.id,
      });

      // Update with order info
      await prisma.measurementReport.update({
        where: { id: report.id },
        data: {
          externalId: eagleViewOrder.orderId,
          orderNumber: eagleViewOrder.orderNumber,
          orderStatus: 'ORDERED',
        },
      });

      logger.info(`EagleView order submitted: ${eagleViewOrder.orderId} for opportunity ${opportunityId}`);

      return report;
    } catch (error) {
      logger.error('EagleView order error:', error);
      throw error;
    }
  }

  /**
   * Get EagleView OAuth2 access token (client_credentials flow)
   */
  async getEagleViewAccessToken() {
    // Return cached token if still valid (with 5 minute buffer)
    if (eagleViewTokenCache.token && eagleViewTokenCache.expiresAt > Date.now() + 300000) {
      return eagleViewTokenCache.token;
    }

    if (!EAGLEVIEW_CLIENT_ID || !EAGLEVIEW_CLIENT_SECRET) {
      throw new Error('EagleView credentials not configured. Please set EAGLEVIEW_CLIENT_ID and EAGLEVIEW_CLIENT_SECRET environment variables.');
    }

    const requestBody = `grant_type=client_credentials&client_id=${encodeURIComponent(EAGLEVIEW_CLIENT_ID)}&client_secret=${encodeURIComponent(EAGLEVIEW_CLIENT_SECRET)}`;

    const response = await fetch(EAGLEVIEW_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('EagleView token error:', error);
      throw new Error(`EagleView authentication failed: ${error}`);
    }

    const data = await response.json();
    eagleViewTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    return data.access_token;
  }

  async submitEagleViewOrder(orderData) {
    const accessToken = await this.getEagleViewAccessToken();

    // Build order payload matching Salesforce EagleViewPlaceorderOpportunityAPI structure
    const orderPayload = {
      OrderReports: [{
        ReferenceID: orderData.referenceId,
        PrimaryProductId: this.getEagleViewProductId(orderData.reportType),
        DeliveryProductId: this.getEagleViewDeliveryProductId(orderData.reportType),
        MeasurementInstructionType: orderData.measurementInstructionType || 1,
        ChangesInLast4Years: false,
        ReportAddresses: [{
          Address: orderData.address,
          City: orderData.city,
          State: orderData.state,
          Zip: orderData.zip,
          Country: orderData.country || 'USA',
          Latitude: orderData.latitude,
          Longitude: orderData.longitude,
          AddressType: 1,
        }],
        ReportAttributes: [{
          Attribute: 24, // Email notification attribute
          Value: orderData.ownerEmail || process.env.EAGLEVIEW_NOTIFICATION_EMAIL || 'operations@pandaexteriors.com',
        }],
      }],
    };

    const response = await fetch(`${EAGLEVIEW_API_BASE}/Order/PlaceOrder`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('EagleView order error:', error);
      throw new Error(`EagleView API error: ${error}`);
    }

    const result = await response.json();

    // EagleView returns ReportIds array
    const reportId = result.ReportIds?.[0];

    return {
      orderId: reportId?.toString(),
      orderNumber: reportId?.toString(),
      rawResponse: result,
    };
  }

  /**
   * Map report type to EagleView Primary Product ID
   * Based on EgalviewParameter__mdt in Salesforce
   */
  getEagleViewProductId(reportType) {
    const productMap = {
      'BASIC': 89, // ResidentialBasic
      'PREMIUM': 90, // ResidentialPremium
      'ULTRA_PREMIUM': 91, // ResidentialUltraPremium
      'COMMERCIAL': 92, // Commercial
      'WALLS_ONLY': 93, // WallsOnly
      'ROOF_AND_WALLS': 94, // RoofAndWalls
    };
    return productMap[reportType] || 90; // Default to Premium
  }

  /**
   * Map report type to EagleView Delivery Product ID
   */
  getEagleViewDeliveryProductId(reportType) {
    // Typically same as primary or a specific delivery format ID
    return this.getEagleViewProductId(reportType);
  }

  /**
   * Handle EagleView webhook delivery
   */
  async handleEagleViewWebhook(data) {
    const { orderId, status, report } = data;

    logger.info(`EagleView webhook: order ${orderId} status ${status}`);

    const measurementReport = await prisma.measurementReport.findFirst({
      where: { externalId: orderId },
    });

    if (!measurementReport) {
      logger.error(`No measurement report found for EagleView order ${orderId}`);
      return;
    }

    if (status === 'COMPLETED' && report) {
      await this.processEagleViewReport(measurementReport.id, report);
    } else if (status === 'FAILED') {
      await prisma.measurementReport.update({
        where: { id: measurementReport.id },
        data: { orderStatus: 'FAILED' },
      });
    }
  }

  async processEagleViewReport(reportId, eagleViewData) {
    const measurements = this.parseEagleViewMeasurements(eagleViewData);

    await prisma.measurementReport.update({
      where: { id: reportId },
      data: {
        orderStatus: 'DELIVERED',
        deliveredAt: new Date(),
        reportUrl: eagleViewData.reportUrl,
        reportPdfUrl: eagleViewData.pdfUrl,
        reportXmlUrl: eagleViewData.xmlUrl,
        reportJsonUrl: eagleViewData.jsonUrl,
        latitude: eagleViewData.coordinates?.lat,
        longitude: eagleViewData.coordinates?.lng,
        ...measurements,
        rawData: eagleViewData,
      },
    });

    logger.info(`EagleView report processed: ${reportId}`);
  }

  // ==========================================
  // EagleView Report Retrieval (Polling)
  // Replicates Salesforce EgaleViewGetReports_API
  // ==========================================

  /**
   * Fetch EagleView report by Report ID
   * Called by polling job or manually to retrieve completed report
   * Replicates: GetReports(ReportId, accId, accessToken) from Salesforce
   */
  async fetchEagleViewReport(reportId) {
    const accessToken = await this.getEagleViewAccessToken();

    // EagleView API v3 endpoint for report retrieval
    const reportUrl = `https://apicenter.eagleview.com/v3/Report/GetReport?reportId=${reportId}`;

    const response = await fetch(reportUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`EagleView GetReport error for ${reportId}:`, error);
      throw new Error(`EagleView API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Fetch EagleView waste/complexity data
   * Replicates: GetWasteTable(ReportId, accId, accessToken) from Salesforce
   */
  async fetchEagleViewWasteData(reportId) {
    const accessToken = await this.getEagleViewAccessToken();

    // EagleView API v1 endpoint for waste recommendations
    const wasteUrl = `https://apicenter.eagleview.com/v1/reports/${reportId}/waste`;

    const response = await fetch(wasteUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Waste data may not be available for all reports
      if (response.status === 404) {
        logger.warn(`Waste data not available for report ${reportId}`);
        return null;
      }
      const error = await response.text();
      logger.error(`EagleView GetWaste error for ${reportId}:`, error);
      throw new Error(`EagleView API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Download EagleView PDF report and get download URL
   * Replicates: PDF download and ContentVersion storage from Salesforce
   */
  async downloadEagleViewPdf(reportId) {
    const accessToken = await this.getEagleViewAccessToken();

    // EagleView API v1 endpoint for PDF download
    const pdfUrl = `https://apicenter.eagleview.com/v1/File/GetReportFile?reportId=${reportId}&fileType=PDF`;

    const response = await fetch(pdfUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`EagleView PDF download error for ${reportId}:`, error);
      throw new Error(`EagleView PDF download error: ${error}`);
    }

    // Return the response for streaming or buffer conversion
    return {
      response,
      contentType: response.headers.get('content-type'),
      contentDisposition: response.headers.get('content-disposition'),
    };
  }

  /**
   * Download EagleView PDF and store it in S3
   * Replicates Salesforce ContentVersion storage functionality
   * @param {string} eagleViewReportId - EagleView report ID
   * @param {string} measurementReportId - Our internal measurement report ID
   * @returns {Object} - { s3Key, s3Url } if successful
   */
  async downloadAndStorePdf(eagleViewReportId, measurementReportId) {
    try {
      const { response } = await this.downloadEagleViewPdf(eagleViewReportId);

      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Generate S3 key
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const s3Key = `eagleview/${measurementReportId}/${eagleViewReportId}_${timestamp}.pdf`;

      // Upload to S3
      const putCommand = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/pdf',
        Metadata: {
          'eagleview-report-id': eagleViewReportId,
          'measurement-report-id': measurementReportId,
          'uploaded-at': new Date().toISOString(),
        },
      });

      await s3Client.send(putCommand);

      // Generate presigned URL for access (valid for 7 days)
      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });
      const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 7 * 24 * 60 * 60 });

      logger.info(`Stored EagleView PDF to S3: ${s3Key}`);

      return {
        s3Key,
        s3Url: `s3://${S3_BUCKET}/${s3Key}`,
        presignedUrl,
      };
    } catch (error) {
      logger.error(`Failed to download and store PDF for ${eagleViewReportId}:`, error);
      throw error;
    }
  }

  /**
   * Get a presigned URL for an existing PDF in S3
   * @param {string} s3Key - The S3 key of the stored PDF
   * @param {number} expiresIn - URL expiration in seconds (default 1 hour)
   */
  async getPdfPresignedUrl(s3Key, expiresIn = 3600) {
    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });
    return getSignedUrl(s3Client, getCommand, { expiresIn });
  }

  /**
   * Poll for and retrieve a single pending EagleView report
   * Used by batch job to check if report is ready
   */
  async pollEagleViewReport(measurementReportId) {
    const measurementReport = await prisma.measurementReport.findUnique({
      where: { id: measurementReportId },
    });

    if (!measurementReport || !measurementReport.externalId) {
      throw new Error(`No EagleView external ID found for report ${measurementReportId}`);
    }

    const eagleViewReportId = measurementReport.externalId;

    try {
      // Fetch the report
      const reportData = await this.fetchEagleViewReport(eagleViewReportId);

      // Check if report is complete
      if (reportData.Status === 'Complete' || reportData.status === 'complete') {
        // Fetch waste data
        let wasteData = null;
        try {
          wasteData = await this.fetchEagleViewWasteData(eagleViewReportId);
        } catch (err) {
          logger.warn(`Could not fetch waste data for ${eagleViewReportId}:`, err.message);
        }

        // Parse measurements from EagleView response
        const measurements = this.parseEagleViewApiResponse(reportData, wasteData);

        // Download and store PDF to S3 (like Salesforce ContentVersion)
        let pdfStorage = null;
        try {
          pdfStorage = await this.downloadAndStorePdf(eagleViewReportId, measurementReportId);
          logger.info(`PDF stored to S3 for report ${eagleViewReportId}: ${pdfStorage.s3Key}`);
        } catch (err) {
          logger.warn(`Could not download/store PDF for ${eagleViewReportId}:`, err.message);
        }

        // Update our report
        await prisma.measurementReport.update({
          where: { id: measurementReportId },
          data: {
            orderStatus: 'DELIVERED',
            deliveredAt: new Date(),
            reportUrl: reportData.ReportLink || reportData.reportUrl,
            reportPdfUrl: pdfStorage?.presignedUrl || reportData.PdfReportLink || reportData.pdfUrl,
            reportXmlUrl: reportData.XmlReportLink || reportData.xmlUrl,
            latitude: reportData.Latitude || reportData.latitude,
            longitude: reportData.Longitude || reportData.longitude,
            ...measurements,
            rawData: {
              reportData,
              wasteData,
              pdfS3Key: pdfStorage?.s3Key,
              pdfS3Url: pdfStorage?.s3Url,
            },
          },
        });

        logger.info(`EagleView report ${eagleViewReportId} retrieved and stored for ${measurementReportId}`);
        return { success: true, status: 'DELIVERED', pdfS3Key: pdfStorage?.s3Key };
      } else {
        // Report still processing
        logger.info(`EagleView report ${eagleViewReportId} still processing: ${reportData.Status || reportData.status}`);
        return { success: false, status: reportData.Status || reportData.status };
      }
    } catch (error) {
      logger.error(`Error polling EagleView report ${eagleViewReportId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse EagleView API response format (different from webhook format)
   * Based on Salesforce EgaleViewGetReports_API.GetReports parsing
   */
  parseEagleViewApiResponse(reportData, wasteData) {
    // Handle both old and new API response formats
    const measurements = reportData.Measurements || reportData.measurements || {};
    const roofData = measurements.Roof || measurements.roof || {};
    const structureData = measurements.Structure || measurements.structure || {};
    const pitchTable = measurements.PitchTable || measurements.pitchTable || [];

    // Parse pitch breakdown
    const pitches = pitchTable.map(p => ({
      pitch: p.Pitch || p.pitch,
      area: p.Area || p.area,
      percentage: p.Percentage || p.percentage,
    }));

    // Get predominant pitch (highest area)
    const predominantPitch = pitches.length > 0
      ? pitches.reduce((max, p) => (p.area > (max?.area || 0) ? p : max), null)?.pitch
      : null;

    // Parse waste data
    let suggestedWasteFactor = null;
    let complexityCategory = null;
    if (wasteData) {
      suggestedWasteFactor = wasteData.RecommendedWaste || wasteData.recommendedWaste || wasteData.WastePercent;
      complexityCategory = wasteData.ComplexityCategory || wasteData.complexityCategory;
    }

    return {
      totalRoofArea: roofData.TotalArea || roofData.totalArea,
      totalRoofSquares: roofData.TotalSquares || roofData.totalSquares ||
        (roofData.TotalArea ? roofData.TotalArea / 100 : null),
      predominantPitch: predominantPitch?.toString(),
      pitches: pitches.length > 0 ? pitches : null,
      facets: roofData.FacetCount || roofData.facetCount || roofData.NumberOfFacets,
      ridgeLength: roofData.Ridge || roofData.ridge || roofData.RidgeLength,
      hipLength: roofData.Hip || roofData.hip || roofData.HipLength,
      valleyLength: roofData.Valley || roofData.valley || roofData.ValleyLength,
      rakeLength: roofData.Rake || roofData.rake || roofData.RakeLength,
      eaveLength: roofData.Eave || roofData.eave || roofData.EaveLength,
      flashingLength: roofData.Flashing || roofData.flashing || roofData.FlashingLength,
      stepFlashingLength: roofData.StepFlashing || roofData.stepFlashing,
      dripEdgeLength: roofData.DripEdge || roofData.dripEdge,
      structureType: structureData.Type || structureData.type || structureData.BuildingType,
      stories: structureData.Stories || structureData.stories || structureData.NumberOfStories,
      buildingHeight: structureData.Height || structureData.height,
      roofComplexity: complexityCategory ? this.mapComplexityCategory(complexityCategory) :
        this.calculateComplexity(roofData.FacetCount || roofData.facetCount),
      suggestedWasteFactor: suggestedWasteFactor,
      windowCount: structureData.WindowCount || structureData.windowCount,
      doorCount: structureData.DoorCount || structureData.doorCount,
      skylightCount: roofData.SkylightCount || roofData.skylightCount,
    };
  }

  /**
   * Map EagleView complexity category to our enum
   */
  mapComplexityCategory(category) {
    const categoryMap = {
      'Simple': 'SIMPLE',
      'Moderate': 'MODERATE',
      'Complex': 'COMPLEX',
      'Very Complex': 'VERY_COMPLEX',
      '1': 'SIMPLE',
      '2': 'MODERATE',
      '3': 'COMPLEX',
      '4': 'VERY_COMPLEX',
    };
    return categoryMap[category] || null;
  }

  /**
   * Batch process all pending EagleView reports
   * Replicates: EagleViewGetReportOnAccount_Batch from Salesforce
   * Should be called by a scheduled job
   */
  async processPendingEagleViewReports() {
    const pendingReports = await prisma.measurementReport.findMany({
      where: {
        provider: 'EAGLEVIEW',
        orderStatus: { in: ['PENDING', 'ORDERED', 'PROCESSING'] },
        externalId: { not: null },
        // Only check reports ordered more than 5 minutes ago
        orderedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      take: 50, // Process in batches of 50
      orderBy: { orderedAt: 'asc' },
    });

    logger.info(`Processing ${pendingReports.length} pending EagleView reports`);

    const results = {
      total: pendingReports.length,
      delivered: 0,
      stillPending: 0,
      failed: 0,
    };

    for (const report of pendingReports) {
      try {
        const result = await this.pollEagleViewReport(report.id);
        if (result.success) {
          results.delivered++;
        } else if (result.error) {
          results.failed++;
        } else {
          results.stillPending++;
        }
        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Failed to poll report ${report.id}:`, error);
        results.failed++;
      }
    }

    logger.info(`EagleView batch complete: ${results.delivered} delivered, ${results.stillPending} pending, ${results.failed} failed`);

    return results;
  }

  /**
   * Batch process all pending GAF reports
   * Similar to EagleView batch processing
   */
  async processPendingGAFReports() {
    const pendingReports = await prisma.measurementReport.findMany({
      where: {
        provider: 'GAF_QUICKMEASURE',
        orderStatus: { in: ['PENDING', 'ORDERED', 'PROCESSING'] },
        externalId: { not: null },
        orderedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      take: 50,
      orderBy: { orderedAt: 'asc' },
    });

    logger.info(`Processing ${pendingReports.length} pending GAF reports`);

    const results = {
      total: pendingReports.length,
      delivered: 0,
      stillPending: 0,
      failed: 0,
    };

    for (const report of pendingReports) {
      try {
        const result = await this.pollGAFReport(report.id);
        if (result.success) {
          results.delivered++;
        } else if (result.error) {
          results.failed++;
        } else {
          results.stillPending++;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Failed to poll GAF report ${report.id}:`, error);
        results.failed++;
      }
    }

    logger.info(`GAF batch complete: ${results.delivered} delivered, ${results.stillPending} pending, ${results.failed} failed`);

    return results;
  }

  /**
   * Poll for and retrieve a single pending GAF report
   */
  async pollGAFReport(measurementReportId) {
    const measurementReport = await prisma.measurementReport.findUnique({
      where: { id: measurementReportId },
    });

    if (!measurementReport || !measurementReport.externalId) {
      throw new Error(`No GAF external ID found for report ${measurementReportId}`);
    }

    const gafOrderNumber = measurementReport.externalId;

    try {
      const accessToken = await this.getGAFAccessToken();

      // GAF API endpoint for order status
      const statusUrl = `${GAF_API_BASE}/OrderStatus/${gafOrderNumber}`;

      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`GAF API error: ${error}`);
      }

      const statusData = await response.json();

      // Check if report is complete
      if (statusData.orderStatus === 'Completed' || statusData.orderStatus === 'Complete') {
        // Fetch the actual measurement data
        const measurementsUrl = `${GAF_API_BASE}/Download/${gafOrderNumber}`;

        const measurementsResponse = await fetch(measurementsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (measurementsResponse.ok) {
          const measurementData = await measurementsResponse.json();
          const measurements = this.parseGAFMeasurements(measurementData);

          await prisma.measurementReport.update({
            where: { id: measurementReportId },
            data: {
              orderStatus: 'DELIVERED',
              deliveredAt: new Date(),
              reportUrl: statusData.viewUrl || measurementData.viewUrl,
              reportPdfUrl: statusData.pdfUrl || measurementData.pdfUrl,
              ...measurements,
              rawData: { statusData, measurementData },
            },
          });

          logger.info(`GAF report ${gafOrderNumber} retrieved and stored for ${measurementReportId}`);
          return { success: true, status: 'DELIVERED' };
        }
      }

      logger.info(`GAF report ${gafOrderNumber} still processing: ${statusData.orderStatus}`);
      return { success: false, status: statusData.orderStatus };
    } catch (error) {
      logger.error(`Error polling GAF report ${gafOrderNumber}:`, error);
      return { success: false, error: error.message };
    }
  }

  parseEagleViewMeasurements(data) {
    const roof = data.roofMeasurements || {};
    const structure = data.structureInfo || {};

    return {
      totalRoofArea: roof.totalArea,
      totalRoofSquares: roof.totalArea ? roof.totalArea / 100 : null, // Convert sq ft to squares
      predominantPitch: roof.predominantPitch,
      pitches: roof.pitchDetails,
      facets: roof.facetCount,
      ridgeLength: roof.ridgeLength,
      hipLength: roof.hipLength,
      valleyLength: roof.valleyLength,
      rakeLength: roof.rakeLength,
      eaveLength: roof.eaveLength,
      flashingLength: roof.flashingLength,
      stepFlashingLength: roof.stepFlashingLength,
      dripEdgeLength: roof.dripEdgeLength,
      structureType: structure.type,
      stories: structure.stories,
      buildingHeight: structure.height,
      roofComplexity: this.calculateComplexity(roof.facetCount),
      suggestedWasteFactor: roof.suggestedWasteFactor,
      windowCount: structure.windowCount,
      doorCount: structure.doorCount,
      skylightCount: roof.skylightCount,
      totalGutterLength: data.gutterMeasurements?.totalLength,
      downspoutCount: data.gutterMeasurements?.downspoutCount,
      totalSidingArea: data.sidingMeasurements?.totalArea,
      sidingWalls: data.sidingMeasurements?.walls,
    };
  }

  // ==========================================
  // GAF QuickMeasure Integration
  // ==========================================

  /**
   * Order a GAF QuickMeasure report
   * Measurement Types:
   * - QuickMeasureResidentialSingleFamily
   * - ResidentialMultiFamily
   * - Commercial
   *
   * Measurement Instructions:
   * - Primary Structure & Detached Garage
   * - Primary Structure Only
   * - All Structures on Parcel
   * - Commercial Complex
   */
  async orderGAFReport(data) {
    const {
      opportunityId,
      address,
      city,
      state,
      zip,
      measurementType = 'QuickMeasureResidentialSingleFamily',
      measurementInstructions = 'MeasurementInstruction.Primary Structure Only',
      latitude,
      longitude,
      comments,
      userId,
    } = data;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { account: true },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Map measurement type to report type
    const reportType = this.mapGAFMeasurementType(measurementType);

    // Look up internal user ID from Cognito ID (orderedById is optional)
    const orderedById = await this.getUserIdFromCognitoId(userId);

    try {
      const report = await prisma.measurementReport.create({
        data: {
          provider: 'GAF_QUICKMEASURE',
          reportType,
          orderStatus: 'PENDING',
          propertyAddress: address || opportunity.street,
          propertyCity: city || opportunity.city,
          propertyState: state || opportunity.state,
          propertyZip: zip || opportunity.postalCode,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          opportunityId,
          accountId: opportunity.accountId,
          orderedById,
          orderedAt: new Date(),
          notes: comments,
          rawData: {
            measurementType,
            measurementInstructions,
            comments,
          },
        },
      });

      // Submit to GAF API
      const gafOrder = await this.submitGAFOrder({
        address: report.propertyAddress,
        city: report.propertyCity,
        state: report.propertyState,
        zip: report.propertyZip,
        latitude: report.latitude,
        longitude: report.longitude,
        measurementType,
        measurementInstructions,
        comments,
        referenceId: report.id,
      });

      await prisma.measurementReport.update({
        where: { id: report.id },
        data: {
          externalId: gafOrder.orderId,
          orderNumber: gafOrder.orderNumber,
          orderStatus: 'ORDERED',
        },
      });

      logger.info(`GAF QuickMeasure order submitted: ${gafOrder.orderId}`);

      return report;
    } catch (error) {
      logger.error('GAF order error:', error);
      throw error;
    }
  }

  mapGAFMeasurementType(type) {
    // Map GAF measurement types to valid ReportType enum values
    // Valid: BASIC, PREMIUM, ULTRA_PREMIUM, COMMERCIAL, WALLS_ONLY, ROOF_AND_WALLS
    const typeMap = {
      'QuickMeasureResidentialSingleFamily': 'BASIC',
      'ResidentialMultiFamily': 'PREMIUM',
      'Commercial': 'COMMERCIAL',
    };
    return typeMap[type] || 'BASIC';
  }

  /**
   * Get GAF QuickMeasure OAuth2 access token (client_credentials flow)
   * Uses Okta-style OAuth with audience and scope parameters
   */
  async getGAFAccessToken() {
    // Return cached token if still valid (with 5 minute buffer)
    if (gafTokenCache.token && gafTokenCache.expiresAt > Date.now() + 300000) {
      return gafTokenCache.token;
    }

    if (!GAF_CLIENT_ID || !GAF_CLIENT_SECRET) {
      throw new Error('GAF QuickMeasure credentials not configured. Please set GAF_CLIENT_ID and GAF_CLIENT_SECRET environment variables.');
    }

    const requestBody = `grant_type=client_credentials&client_id=${encodeURIComponent(GAF_CLIENT_ID)}&client_secret=${encodeURIComponent(GAF_CLIENT_SECRET)}&audience=${encodeURIComponent(GAF_AUDIENCE)}&scope=${encodeURIComponent(GAF_SCOPE)}`;

    const response = await fetch(GAF_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('GAF token error:', error);
      throw new Error(`GAF authentication failed: ${error}`);
    }

    const data = await response.json();
    gafTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    return data.access_token;
  }

  async submitGAFOrder(orderData) {
    const accessToken = await this.getGAFAccessToken();

    // Build order payload matching Salesforce GAF_PlaceOrderMeasurement_API structure
    const orderPayload = {
      subscriberName: 'PAN',
      subscriberOrderNumber: orderData.referenceId || `GP-${Date.now()}`,
      SubscriberCustomField1: orderData.referenceId || '',
      emailAddress: orderData.ownerEmail || process.env.GAF_NOTIFICATION_EMAIL || 'jasondaniel@panda-exteriors.com',
      productCode: this.getGAFProductCode(orderData.measurementType),
      address1: orderData.address,
      address2: '',
      city: orderData.city,
      stateOrProvince: this.getStateAbbreviation(orderData.state),
      postalCode: orderData.zip,
      fipscode: 'Fips Code',
      county: 'USA',
      country: orderData.country || 'USA',
      latitude: orderData.latitude?.toString() || '',
      longitude: orderData.longitude?.toString() || '',
      fullAddress: `${orderData.address} ${orderData.city} ${orderData.zip} ${orderData.country || 'USA'}`,
      recipientEmailAddresses: orderData.recipientEmails || '',
      instructions: orderData.comments || '',
      isServiceOpen: false,
      susbcriberId: 0,
      ignoreCache: true,
      trackingId: '10',
      checkForDuplicate: false,
      SuggestedWaste: '',
    };

    const response = await fetch(`${GAF_API_BASE}/Order`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('GAF order error:', error);
      throw new Error(`GAF API error: ${error}`);
    }

    const result = await response.json();

    return {
      orderId: result.gafOrderNumber?.toString(),
      orderNumber: result.gafOrderNumber?.toString(),
      subscriberOrderNumber: result.subscriberOrderNumber,
      orderDateTime: result.orderDateTime,
      rawResponse: result,
    };
  }

  /**
   * Map measurement type to GAF product code
   * Based on Salesforce GAF_PlaceOrderMeasurement_API implementation
   */
  getGAFProductCode(measurementType) {
    const productMap = {
      'QuickMeasureResidentialSingleFamily': 'SF-QM-USA',
      'ResidentialMultiFamily': 'MF-QM-USA',
      'Commercial': 'CM-QM-USA',
      'QuickMeasure: Residential Single Family': 'SF-QM-USA',
      'QuickMeasure: Residential Multi Family': 'MF-QM-USA',
      'QuickMeasure: Commercial': 'CM-QM-USA',
    };
    return productMap[measurementType] || 'SF-QM-USA'; // Default to Single Family
  }

  /**
   * Convert state name to abbreviation for GAF API
   */
  getStateAbbreviation(state) {
    if (!state) return '';
    // If already an abbreviation (2 chars), return as-is
    if (state.length === 2) return state.toUpperCase();

    const stateMap = {
      'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
      'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
      'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
      'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
      'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
      'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
      'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
      'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
      'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
      'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
      'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
      'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
      'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
    };
    return stateMap[state] || state;
  }

  /**
   * Handle GAF webhook delivery
   */
  async handleGAFWebhook(data) {
    const { orderId, status, measurements } = data;

    logger.info(`GAF webhook: order ${orderId} status ${status}`);

    const measurementReport = await prisma.measurementReport.findFirst({
      where: { externalId: orderId },
    });

    if (!measurementReport) {
      logger.error(`No measurement report found for GAF order ${orderId}`);
      return;
    }

    if (status === 'COMPLETED' && measurements) {
      await this.processGAFReport(measurementReport.id, measurements);
    } else if (status === 'FAILED') {
      await prisma.measurementReport.update({
        where: { id: measurementReport.id },
        data: { orderStatus: 'FAILED' },
      });
    }
  }

  async processGAFReport(reportId, gafData) {
    const measurements = this.parseGAFMeasurements(gafData);

    await prisma.measurementReport.update({
      where: { id: reportId },
      data: {
        orderStatus: 'DELIVERED',
        deliveredAt: new Date(),
        reportUrl: gafData.viewUrl,
        reportPdfUrl: gafData.pdfUrl,
        latitude: gafData.location?.latitude,
        longitude: gafData.location?.longitude,
        ...measurements,
        rawData: gafData,
      },
    });

    logger.info(`GAF report processed: ${reportId}`);
  }

  parseGAFMeasurements(data) {
    const roof = data.roof || {};

    return {
      totalRoofArea: roof.totalSqFt,
      totalRoofSquares: roof.totalSquares,
      predominantPitch: roof.mainPitch,
      pitches: roof.allPitches,
      facets: roof.faceCount,
      ridgeLength: roof.ridge,
      hipLength: roof.hip,
      valleyLength: roof.valley,
      rakeLength: roof.rake,
      eaveLength: roof.eave,
      dripEdgeLength: roof.dripEdge,
      roofComplexity: this.calculateComplexity(roof.faceCount),
      suggestedWasteFactor: roof.recommendedWaste,
    };
  }

  // ==========================================
  // Manual Measurement Entry
  // ==========================================

  /**
   * Create a manual measurement report
   */
  async createManualReport(data) {
    const {
      opportunityId,
      measurements,
      userId,
    } = data;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    const report = await prisma.measurementReport.create({
      data: {
        provider: 'MANUAL',
        reportType: 'BASIC',
        orderStatus: 'DELIVERED',
        propertyAddress: opportunity.street,
        propertyCity: opportunity.city,
        propertyState: opportunity.state,
        propertyZip: opportunity.postalCode,
        opportunityId,
        accountId: opportunity.accountId,
        orderedById: userId,
        orderedAt: new Date(),
        deliveredAt: new Date(),
        ...measurements,
      },
    });

    return report;
  }

  // ==========================================
  // Query Methods
  // ==========================================

  /**
   * Get measurement report for opportunity
   */
  async getReportForOpportunity(opportunityId) {
    return prisma.measurementReport.findFirst({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all reports for opportunity
   */
  async getReportsForOpportunity(opportunityId) {
    return prisma.measurementReport.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pending orders
   */
  async getPendingOrders(provider = null) {
    const where = {
      orderStatus: { in: ['PENDING', 'ORDERED'] },
    };
    if (provider) where.provider = provider;

    return prisma.measurementReport.findMany({
      where,
      include: {
        opportunity: { select: { id: true, name: true } },
        orderedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { orderedAt: 'desc' },
    });
  }

  /**
   * Get measurement statistics
   */
  async getStats(options = {}) {
    const { startDate, endDate } = options;

    const where = {};
    if (startDate) where.orderedAt = { gte: startDate };
    if (endDate) where.orderedAt = { ...where.orderedAt, lte: endDate };

    const total = await prisma.measurementReport.count({ where });

    const byProvider = await prisma.measurementReport.groupBy({
      by: ['provider'],
      where,
      _count: { id: true },
    });

    const byStatus = await prisma.measurementReport.groupBy({
      by: ['orderStatus'],
      where,
      _count: { id: true },
    });

    const avgMetrics = await prisma.measurementReport.aggregate({
      where: { ...where, orderStatus: 'DELIVERED' },
      _avg: {
        totalRoofArea: true,
        totalRoofSquares: true,
        facets: true,
      },
    });

    return {
      total,
      byProvider: byProvider.reduce((acc, item) => {
        acc[item.provider] = item._count.id;
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.orderStatus] = item._count.id;
        return acc;
      }, {}),
      averages: {
        roofArea: Math.round(avgMetrics._avg.totalRoofArea || 0),
        roofSquares: Math.round((avgMetrics._avg.totalRoofSquares || 0) * 10) / 10,
        facets: Math.round(avgMetrics._avg.facets || 0),
      },
    };
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  calculateComplexity(facetCount) {
    if (!facetCount) return null;
    if (facetCount <= 10) return 'SIMPLE';
    if (facetCount <= 25) return 'MODERATE';
    if (facetCount <= 50) return 'COMPLEX';
    return 'VERY_COMPLEX';
  }

  mapReportType(type) {
    const typeMap = {
      'BASIC': 'ResidentialBasic',
      'PREMIUM': 'ResidentialPremium',
      'ULTRA_PREMIUM': 'ResidentialUltraPremium',
      'COMMERCIAL': 'Commercial',
      'WALLS_ONLY': 'WallsOnly',
      'ROOF_AND_WALLS': 'RoofAndWalls',
    };
    return typeMap[type] || 'ResidentialPremium';
  }

  // ==========================================
  // Hover Integration
  // ==========================================
  // Hover provides photo-based 3D modeling, measurements, and design visualization
  // Key features:
  // - 3D interactive property models from smartphone photos
  // - Accurate roof, siding, window, door measurements
  // - Design visualization with real material brands (GAF, JamesHardie, Alside)
  // - Multiple export formats: JSON, PDF, XLSX, SKP (SketchUp), ESX, XML

  /**
   * Generate Hover OAuth authorization URL
   * Hover uses Authorization Code Grant (not client_credentials)
   * User must authorize via browser redirect
   */
  getHoverAuthorizationUrl(state = null) {
    if (!HOVER_CLIENT_ID) {
      throw new Error('Hover credentials not configured. Please set HOVER_CLIENT_ID environment variable.');
    }

    const params = new URLSearchParams({
      client_id: HOVER_CLIENT_ID,
      redirect_uri: HOVER_REDIRECT_URI,
      response_type: 'code',
      scope: 'read write',
    });

    if (state) {
      params.append('state', state);
    }

    return `${HOVER_OAUTH_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * Called after user authorizes via OAuth redirect
   */
  async exchangeHoverCode(code) {
    if (!HOVER_CLIENT_ID || !HOVER_CLIENT_SECRET) {
      throw new Error('Hover credentials not configured. Please set HOVER_CLIENT_ID and HOVER_CLIENT_SECRET environment variables.');
    }

    // Hover recommends JSON format for token requests
    const response = await fetch(`${HOVER_OAUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: HOVER_CLIENT_ID,
        client_secret: HOVER_CLIENT_SECRET,
        code,
        redirect_uri: HOVER_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Hover token exchange error:', error);
      throw new Error(`Hover authentication failed: ${error}`);
    }

    const data = await response.json();

    // Cache the tokens (access token expires in 7200 seconds / 2 hours)
    hoverTokenCache = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    // Store refresh token in database for persistence across restarts
    await this.storeHoverRefreshToken(data.refresh_token);

    logger.info('Hover OAuth tokens obtained successfully');

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh Hover access token using refresh token
   */
  async refreshHoverToken() {
    let refreshToken = hoverTokenCache.refreshToken;

    // If not in cache, try to load from database
    if (!refreshToken) {
      refreshToken = await this.getStoredHoverRefreshToken();
    }

    if (!refreshToken) {
      throw new Error('No Hover refresh token available. User must re-authorize.');
    }

    // Hover recommends JSON format for token requests
    const response = await fetch(`${HOVER_OAUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: HOVER_CLIENT_ID,
        client_secret: HOVER_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Hover token refresh error:', error);
      // Clear invalid tokens
      hoverTokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 };
      throw new Error(`Hover token refresh failed: ${error}. User must re-authorize.`);
    }

    const data = await response.json();

    hoverTokenCache = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Some OAuth servers don't return new refresh token
      expiresAt: Date.now() + (data.expires_in * 1000),
    };

    if (data.refresh_token) {
      await this.storeHoverRefreshToken(data.refresh_token);
    }

    return data.access_token;
  }

  /**
   * Get valid Hover access token (from cache or refresh)
   */
  async getHoverAccessToken() {
    // Return cached token if still valid (with 5 minute buffer)
    if (hoverTokenCache.accessToken && hoverTokenCache.expiresAt > Date.now() + 300000) {
      return hoverTokenCache.accessToken;
    }

    // Try to refresh the token
    return this.refreshHoverToken();
  }

  /**
   * Store Hover refresh token in database
   */
  async storeHoverRefreshToken(refreshToken) {
    try {
      await prisma.integrationCredential.upsert({
        where: { provider: 'HOVER' },
        update: { refreshToken, updatedAt: new Date() },
        create: {
          provider: 'HOVER',
          refreshToken,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Table might not exist yet, log and continue
      logger.warn('Could not store Hover refresh token:', error.message);
    }
  }

  /**
   * Get stored Hover refresh token from database
   */
  async getStoredHoverRefreshToken() {
    try {
      const cred = await prisma.integrationCredential.findUnique({
        where: { provider: 'HOVER' },
      });
      return cred?.refreshToken;
    } catch (error) {
      logger.warn('Could not retrieve Hover refresh token:', error.message);
      return null;
    }
  }

  /**
   * Create a Hover capture request
   * This initiates a job for a property to be captured via smartphone photos
   *
   * @param {Object} data - Capture request data
   * @param {string} data.opportunityId - Link to opportunity
   * @param {string} data.name - Job name (e.g., customer name)
   * @param {string} data.address - Property street address
   * @param {string} data.city - City
   * @param {string} data.state - State
   * @param {string} data.zip - ZIP code
   * @param {string} data.deliverableSetting - Which deliverables to generate
   * @param {string} data.captureType - 'exterior' or 'interior'
   * @param {string} data.userId - User creating the request
   */
  async createHoverCaptureRequest(data) {
    const {
      opportunityId,
      name,
      address,
      city,
      state,
      zip,
      deliverableSetting = 'complete_json_and_all_reports',
      captureType = 'exterior',
      userId,
    } = data;

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { account: true },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Validate userId if provided - set to null if user doesn't exist
    let validatedUserId = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (user) {
        validatedUserId = user.id;
      }
    }

    try {
      // Map captureType to valid ReportType enum
      // Valid: BASIC, PREMIUM, ULTRA_PREMIUM, COMMERCIAL, WALLS_ONLY, ROOF_AND_WALLS
      const reportTypeMap = {
        'exterior': 'ROOF_AND_WALLS',
        'interior': 'WALLS_ONLY',
        'full': 'PREMIUM',
      };
      const reportType = reportTypeMap[captureType.toLowerCase()] || 'ROOF_AND_WALLS';

      // Create pending measurement report
      const report = await prisma.measurementReport.create({
        data: {
          provider: 'HOVER',
          reportType,
          orderStatus: 'PENDING',
          propertyAddress: address || opportunity.street,
          propertyCity: city || opportunity.city,
          propertyState: state || opportunity.state,
          propertyZip: zip || opportunity.postalCode,
          opportunityId,
          accountId: opportunity.accountId,
          orderedById: validatedUserId,
          orderedAt: new Date(),
          rawData: {
            captureType,
            deliverableSetting,
          },
        },
      });

      const accessToken = await this.getHoverAccessToken();

      // Build capture request payload
      const payload = {
        name: name || `${opportunity.account?.name || 'Property'} - ${report.propertyAddress}`,
        location: {
          street_address: report.propertyAddress,
          city: report.propertyCity,
          region: this.getStateAbbreviation(report.propertyState),
          postal_code: report.propertyZip,
          country_code: 'US',
        },
        deliverable_setting: deliverableSetting,
        external_identifier: report.id, // Link back to our report
      };

      const response = await fetch(`${HOVER_API_BASE}/capture_requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Hover capture request error:', error);
        throw new Error(`Hover API error: ${error}`);
      }

      const result = await response.json();

      // Update report with Hover IDs
      await prisma.measurementReport.update({
        where: { id: report.id },
        data: {
          externalId: result.id?.toString(),
          orderNumber: result.id?.toString(),
          orderStatus: 'ORDERED',
          rawData: {
            ...report.rawData,
            captureRequestId: result.id,
            captureLink: result.capture_link, // URL to share with customer/field tech
            state: result.state,
          },
        },
      });

      logger.info(`Hover capture request created: ${result.id} for opportunity ${opportunityId}`);

      return {
        ...report,
        captureRequestId: result.id,
        captureLink: result.capture_link,
        state: result.state,
      };
    } catch (error) {
      logger.error('Hover capture request error:', error);
      throw error;
    }
  }

  /**
   * Get Hover job details and measurements
   * A job is created when capture photos are submitted
   */
  async getHoverJob(jobId) {
    const accessToken = await this.getHoverAccessToken();

    const response = await fetch(`${HOVER_API_BASE}/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Hover get job error:', error);
      throw new Error(`Hover API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Get all jobs for a capture request
   */
  async getHoverJobsForCaptureRequest(captureRequestId) {
    const accessToken = await this.getHoverAccessToken();

    const response = await fetch(`${HOVER_API_BASE}/capture_requests/${captureRequestId}/jobs`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Hover get jobs error:', error);
      throw new Error(`Hover API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Get Hover deliverables (measurement reports, 3D models)
   *
   * Available deliverable types:
   * - complete_json: Full measurement data in JSON
   * - pdf_blueprint: PDF blueprint report
   * - pdf_estimate: PDF estimate report
   * - xlsx_estimate: Excel estimate report
   * - skp: SketchUp 3D model
   * - esx: EagleView compatible export
   * - xml: XML measurement data
   */
  async getHoverDeliverables(jobId, deliverableType = null) {
    const accessToken = await this.getHoverAccessToken();

    let url = `${HOVER_API_BASE}/jobs/${jobId}/deliverables`;
    if (deliverableType) {
      url += `?type=${deliverableType}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Hover get deliverables error:', error);
      throw new Error(`Hover API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Download a specific Hover deliverable file
   */
  async downloadHoverDeliverable(deliverableId) {
    const accessToken = await this.getHoverAccessToken();

    const response = await fetch(`${HOVER_API_BASE}/deliverables/${deliverableId}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Hover download error:', error);
      throw new Error(`Hover API error: ${error}`);
    }

    // This returns the file content or a download URL
    return response;
  }

  /**
   * Get Hover 3D model viewer URL
   * Returns an embeddable URL for the interactive 3D model
   */
  async getHover3DModelUrl(jobId) {
    const accessToken = await this.getHoverAccessToken();

    const response = await fetch(`${HOVER_API_BASE}/jobs/${jobId}/3d_model`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Hover 3D model error:', error);
      throw new Error(`Hover API error: ${error}`);
    }

    const data = await response.json();
    return data.viewer_url || data.embed_url;
  }

  /**
   * Handle Hover webhook notifications
   *
   * Webhook events:
   * - job-state-changed: Job processing state update
   * - model-created: 3D model is ready
   * - capture-request-state-changed: Capture request status update
   * - deliverable-created: A deliverable file is ready
   */
  async handleHoverWebhook(event) {
    const { event_type, data } = event;

    logger.info(`Hover webhook: ${event_type}`, data);

    switch (event_type) {
      case 'job-state-changed':
        await this.handleHoverJobStateChange(data);
        break;

      case 'model-created':
        await this.handleHoverModelCreated(data);
        break;

      case 'capture-request-state-changed':
        await this.handleHoverCaptureRequestStateChange(data);
        break;

      case 'deliverable-created':
        await this.handleHoverDeliverableCreated(data);
        break;

      default:
        logger.warn(`Unknown Hover webhook event: ${event_type}`);
    }
  }

  async handleHoverJobStateChange(data) {
    const { job_id, state, external_identifier } = data;

    // Find report by external_identifier (our report ID) or job ID
    let report = await prisma.measurementReport.findFirst({
      where: { id: external_identifier },
    });

    if (!report) {
      report = await prisma.measurementReport.findFirst({
        where: {
          provider: 'HOVER',
          rawData: { path: ['jobId'], equals: job_id },
        },
      });
    }

    if (!report) {
      logger.warn(`No measurement report found for Hover job ${job_id}`);
      return;
    }

    // Map Hover states to our status
    const statusMap = {
      'processing': 'PROCESSING',
      'complete': 'DELIVERED',
      'failed': 'FAILED',
      'cancelled': 'CANCELLED',
    };

    const newStatus = statusMap[state] || 'PROCESSING';

    await prisma.measurementReport.update({
      where: { id: report.id },
      data: {
        orderStatus: newStatus,
        rawData: {
          ...report.rawData,
          jobId: job_id,
          jobState: state,
        },
        ...(state === 'complete' && { deliveredAt: new Date() }),
      },
    });

    // If complete, fetch the measurements
    if (state === 'complete') {
      await this.fetchAndStoreHoverMeasurements(report.id, job_id);
    }
  }

  async handleHoverModelCreated(data) {
    const { job_id, model_url, viewer_url } = data;

    const report = await prisma.measurementReport.findFirst({
      where: {
        provider: 'HOVER',
        rawData: { path: ['jobId'], equals: job_id },
      },
    });

    if (report) {
      await prisma.measurementReport.update({
        where: { id: report.id },
        data: {
          rawData: {
            ...report.rawData,
            modelUrl: model_url,
            viewerUrl: viewer_url,
          },
        },
      });
    }
  }

  async handleHoverCaptureRequestStateChange(data) {
    const { capture_request_id, state } = data;

    const report = await prisma.measurementReport.findFirst({
      where: {
        provider: 'HOVER',
        rawData: { path: ['captureRequestId'], equals: capture_request_id },
      },
    });

    if (report) {
      // Map capture request states
      const statusMap = {
        'awaiting_capture': 'ORDERED',
        'capture_complete': 'PROCESSING',
        'cancelled': 'CANCELLED',
      };

      await prisma.measurementReport.update({
        where: { id: report.id },
        data: {
          orderStatus: statusMap[state] || report.orderStatus,
          rawData: {
            ...report.rawData,
            captureState: state,
          },
        },
      });
    }
  }

  async handleHoverDeliverableCreated(data) {
    const { job_id, deliverable_id, deliverable_type, download_url } = data;

    const report = await prisma.measurementReport.findFirst({
      where: {
        provider: 'HOVER',
        rawData: { path: ['jobId'], equals: job_id },
      },
    });

    if (report) {
      const deliverables = report.rawData?.deliverables || [];
      deliverables.push({
        id: deliverable_id,
        type: deliverable_type,
        downloadUrl: download_url,
        createdAt: new Date().toISOString(),
      });

      // Map deliverable type to report URLs
      const urlUpdates = {};
      if (deliverable_type === 'pdf_blueprint' || deliverable_type === 'pdf_estimate') {
        urlUpdates.reportPdfUrl = download_url;
      } else if (deliverable_type === 'complete_json') {
        urlUpdates.reportJsonUrl = download_url;
      } else if (deliverable_type === 'xml') {
        urlUpdates.reportXmlUrl = download_url;
      }

      await prisma.measurementReport.update({
        where: { id: report.id },
        data: {
          ...urlUpdates,
          rawData: {
            ...report.rawData,
            deliverables,
          },
        },
      });
    }
  }

  /**
   * Fetch measurements from Hover job and store in our format
   */
  async fetchAndStoreHoverMeasurements(reportId, jobId) {
    try {
      const job = await this.getHoverJob(jobId);
      const measurements = this.parseHoverMeasurements(job);

      await prisma.measurementReport.update({
        where: { id: reportId },
        data: {
          ...measurements,
          rawData: {
            ...measurements.rawData,
            hoverJob: job,
          },
        },
      });

      logger.info(`Hover measurements stored for report ${reportId}`);
    } catch (error) {
      logger.error(`Failed to fetch Hover measurements: ${error.message}`);
    }
  }

  /**
   * Parse Hover measurement data to our format
   */
  parseHoverMeasurements(hoverData) {
    const roof = hoverData.measurements?.roof || {};
    const siding = hoverData.measurements?.siding || {};
    const structure = hoverData.measurements?.structure || {};
    const windows = hoverData.measurements?.windows || [];
    const doors = hoverData.measurements?.doors || [];

    return {
      // Roof measurements
      totalRoofArea: roof.total_area,
      totalRoofSquares: roof.total_area ? roof.total_area / 100 : null,
      predominantPitch: roof.primary_pitch,
      pitches: roof.pitch_breakdown,
      facets: roof.facet_count,
      ridgeLength: roof.ridge_length,
      hipLength: roof.hip_length,
      valleyLength: roof.valley_length,
      rakeLength: roof.rake_length,
      eaveLength: roof.eave_length,
      flashingLength: roof.flashing_length,
      stepFlashingLength: roof.step_flashing_length,
      dripEdgeLength: roof.drip_edge_length,
      roofComplexity: this.calculateComplexity(roof.facet_count),
      suggestedWasteFactor: roof.suggested_waste,

      // Structure measurements
      structureType: structure.type,
      stories: structure.stories,
      buildingHeight: structure.height,

      // Siding measurements (Hover specialty)
      totalSidingArea: siding.total_area,
      sidingWalls: siding.walls,

      // Window/door counts
      windowCount: windows.length,
      doorCount: doors.length,

      // Store detailed window/door data
      rawData: {
        windows: windows.map(w => ({
          width: w.width,
          height: w.height,
          area: w.area,
          type: w.type,
        })),
        doors: doors.map(d => ({
          width: d.width,
          height: d.height,
          type: d.type,
        })),
      },
    };
  }

  /**
   * Get design visualization options from Hover
   * This returns available materials for virtual design
   */
  async getHoverDesignOptions(jobId) {
    const accessToken = await this.getHoverAccessToken();

    const response = await fetch(`${HOVER_API_BASE}/jobs/${jobId}/design_options`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hover API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Apply design to a Hover 3D model
   * Allows visualizing different roofing, siding, window materials
   *
   * @param {string} jobId - Hover job ID
   * @param {Object} design - Design configuration
   * @param {string} design.roofMaterial - e.g., 'GAF Timberline HDZ - Charcoal'
   * @param {string} design.sidingMaterial - e.g., 'JamesHardie - Arctic White'
   */
  async applyHoverDesign(jobId, design) {
    const accessToken = await this.getHoverAccessToken();

    const response = await fetch(`${HOVER_API_BASE}/jobs/${jobId}/design`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(design),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hover API error: ${error}`);
    }

    return response.json();
  }

  /**
   * Check if Hover is properly configured and authorized
   */
  async checkHoverStatus() {
    const status = {
      configured: Boolean(HOVER_CLIENT_ID && HOVER_CLIENT_SECRET),
      authorized: false,
      tokenValid: false,
      error: null,
    };

    if (!status.configured) {
      status.error = 'Hover credentials not configured';
      return status;
    }

    try {
      const accessToken = await this.getHoverAccessToken();
      status.authorized = true;
      status.tokenValid = true;

      // Try a simple API call to verify
      const response = await fetch(`${HOVER_API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const user = await response.json();
        status.user = user;
      }
    } catch (error) {
      status.error = error.message;
      if (error.message.includes('re-authorize')) {
        status.authorized = false;
        status.authUrl = this.getHoverAuthorizationUrl();
      }
    }

    return status;
  }

  // ==========================================
  // OpenTopography Integration (USGS 3DEP LiDAR)
  // ==========================================

  /**
   * Get USGS 3DEP DEM (Digital Elevation Model) for a location
   * Uses the USGS 1m DEM dataset for highest resolution
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} radius - Radius in meters (default 50m for single property)
   * @param {string} dataset - Dataset name: 'USGS1m', 'USGS10m', 'USGS30m' (default: USGS1m)
   * @returns {Object} - DEM data including elevation stats
   */
  async getOpenTopographyDEM(lat, lng, radius = 50, dataset = 'USGS1m') {
    if (!OPENTOPOGRAPHY_API_KEY) {
      throw new Error('OpenTopography API key not configured');
    }

    // Convert radius to bounding box (approximate)
    // 1 degree latitude ≈ 111,320 meters
    // 1 degree longitude varies by latitude
    const latOffset = radius / 111320;
    const lngOffset = radius / (111320 * Math.cos(lat * Math.PI / 180));

    const south = lat - latOffset;
    const north = lat + latOffset;
    const west = lng - lngOffset;
    const east = lng + lngOffset;

    logger.info(`OpenTopography: Fetching ${dataset} DEM for ${lat},${lng} (${radius}m radius)`);

    const params = new URLSearchParams({
      datasetName: dataset,
      south: south.toFixed(6),
      north: north.toFixed(6),
      west: west.toFixed(6),
      east: east.toFixed(6),
      outputFormat: 'GTiff',
      API_Key: OPENTOPOGRAPHY_API_KEY,
    });

    const response = await fetch(`${OPENTOPOGRAPHY_API_BASE}/usgsdem?${params}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenTopography API error:', errorText);
      throw new Error(`OpenTopography API error: ${response.status} - ${errorText}`);
    }

    // The response is a GeoTIFF binary - we need to get the metadata
    // For now, return the raw data and metadata
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    // Get the binary data
    const arrayBuffer = await response.arrayBuffer();

    logger.info(`OpenTopography: Received ${contentLength} bytes of ${contentType}`);

    return {
      success: true,
      dataset,
      bounds: { south, north, west, east },
      center: { lat, lng },
      radius,
      contentType,
      contentLength: parseInt(contentLength || arrayBuffer.byteLength),
      data: Buffer.from(arrayBuffer),
    };
  }

  /**
   * Check coverage availability for a location
   * Returns which USGS datasets are available for the coordinates
   */
  async checkOpenTopographyCoverage(lat, lng) {
    logger.info(`OpenTopography: Checking coverage for ${lat},${lng}`);

    const coverage = {
      USGS1m: false,
      USGS10m: false,
      USGS30m: false,
    };

    // Check each dataset availability by making a small request
    const latOffset = 0.0001; // ~11 meters
    const lngOffset = 0.0001;

    for (const dataset of ['USGS1m', 'USGS10m', 'USGS30m']) {
      try {
        const params = new URLSearchParams({
          datasetName: dataset,
          south: (lat - latOffset).toFixed(6),
          north: (lat + latOffset).toFixed(6),
          west: (lng - lngOffset).toFixed(6),
          east: (lng + lngOffset).toFixed(6),
          outputFormat: 'GTiff',
          API_Key: OPENTOPOGRAPHY_API_KEY,
        });

        const response = await fetch(`${OPENTOPOGRAPHY_API_BASE}/usgsdem?${params}`, {
          method: 'GET',
        });

        // If we get a 200 and data, coverage exists
        coverage[dataset] = response.ok && parseInt(response.headers.get('content-length') || '0') > 0;
      } catch (error) {
        logger.warn(`Coverage check failed for ${dataset}:`, error.message);
        coverage[dataset] = false;
      }
    }

    return coverage;
  }

  /**
   * Check OpenTopography API status
   */
  async checkOpenTopographyStatus() {
    const status = {
      configured: Boolean(OPENTOPOGRAPHY_API_KEY),
      connected: false,
      error: null,
    };

    if (!status.configured) {
      status.error = 'OpenTopography API key not configured';
      return status;
    }

    try {
      // Test with a known location (Maryland - should have coverage)
      const testLat = 39.0458;
      const testLng = -76.6413;
      const coverage = await this.checkOpenTopographyCoverage(testLat, testLng);
      status.connected = true;
      status.coverage = coverage;
    } catch (error) {
      status.error = error.message;
    }

    return status;
  }

  /**
   * Get Global DEM data (SRTM, ALOS, etc.) for a location
   * These datasets don't require academic access like USGS 1m
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} radius - Radius in meters (minimum ~500m for these datasets)
   * @param {string} demtype - DEM type: 'SRTMGL1' (30m), 'SRTMGL3' (90m), 'AW3D30' (30m)
   * @returns {Object} - DEM data
   */
  async getGlobalDEM(lat, lng, radius = 200, demtype = 'SRTMGL1') {
    if (!OPENTOPOGRAPHY_API_KEY) {
      throw new Error('OpenTopography API key not configured');
    }

    // Convert radius to bounding box
    const latOffset = radius / 111320;
    const lngOffset = radius / (111320 * Math.cos(lat * Math.PI / 180));

    const south = lat - latOffset;
    const north = lat + latOffset;
    const west = lng - lngOffset;
    const east = lng + lngOffset;

    logger.info(`OpenTopography: Fetching ${demtype} Global DEM for ${lat},${lng} (${radius}m radius)`);

    const params = new URLSearchParams({
      demtype: demtype,
      south: south.toFixed(6),
      north: north.toFixed(6),
      west: west.toFixed(6),
      east: east.toFixed(6),
      outputFormat: 'GTiff',
      API_Key: OPENTOPOGRAPHY_API_KEY,
    });

    const response = await fetch(`${OPENTOPOGRAPHY_API_BASE}/globaldem?${params}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenTopography Global DEM API error:', errorText);
      throw new Error(`OpenTopography API error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    const arrayBuffer = await response.arrayBuffer();

    logger.info(`OpenTopography: Received ${contentLength} bytes of ${contentType}`);

    return {
      success: true,
      dataset: demtype,
      bounds: { south, north, west, east },
      center: { lat, lng },
      radius,
      contentType,
      contentLength: parseInt(contentLength || arrayBuffer.byteLength),
      data: Buffer.from(arrayBuffer),
    };
  }

  // ==========================================
  // Google Solar API Integration
  // ==========================================

  /**
   * Get building insights from Google Solar API
   * Returns roof segments, pitch, azimuth, area for a location
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} quality - Image quality: 'LOW', 'MEDIUM', 'HIGH' (default: HIGH)
   * @returns {Object} - Building insights including roof segments
   */
  async getGoogleSolarBuildingInsights(lat, lng, quality = 'HIGH') {
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('Google Maps API key not configured');
    }

    logger.info(`Google Solar: Fetching building insights for ${lat},${lng}`);

    const params = new URLSearchParams({
      'location.latitude': lat.toString(),
      'location.longitude': lng.toString(),
      requiredQuality: quality,
      key: GOOGLE_MAPS_API_KEY,
    });

    const response = await fetch(`${GOOGLE_SOLAR_API_BASE}/buildingInsights:findClosest?${params}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Google Solar API error:', errorText);

      // Parse error for more detail
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(`Google Solar API error: ${errorJson.error?.message || response.status}`);
      } catch (e) {
        throw new Error(`Google Solar API error: ${response.status} - ${errorText}`);
      }
    }

    const data = await response.json();

    logger.info(`Google Solar: Received building insights with ${data.solarPotential?.roofSegmentStats?.length || 0} roof segments`);

    return {
      success: true,
      center: data.center,
      imageryDate: data.imageryDate,
      imageryQuality: data.imageryQuality,
      regionCode: data.regionCode,
      solarPotential: data.solarPotential,
      // Extract key roof measurements
      roofStats: this.parseGoogleSolarRoofStats(data),
    };
  }

  /**
   * Parse Google Solar response into standardized roof measurements
   */
  parseGoogleSolarRoofStats(data) {
    const solarPotential = data.solarPotential;
    if (!solarPotential) {
      return null;
    }

    const roofSegments = solarPotential.roofSegmentStats || [];

    // Calculate totals
    let totalAreaSqFt = 0;
    let totalGroundAreaSqFt = 0;
    const pitches = [];
    const azimuths = [];

    for (const segment of roofSegments) {
      // Convert square meters to square feet (1 sq m = 10.764 sq ft)
      const areaSqFt = (segment.stats?.areaMeters2 || 0) * 10.764;
      const groundAreaSqFt = (segment.stats?.groundAreaMeters2 || 0) * 10.764;

      totalAreaSqFt += areaSqFt;
      totalGroundAreaSqFt += groundAreaSqFt;

      if (segment.pitchDegrees !== undefined) {
        pitches.push({
          degrees: segment.pitchDegrees,
          ratio: this.degreesToPitchRatio(segment.pitchDegrees),
          areaSqFt,
        });
      }

      if (segment.azimuthDegrees !== undefined) {
        azimuths.push({
          degrees: segment.azimuthDegrees,
          direction: this.degreesToCompassDirection(segment.azimuthDegrees),
          areaSqFt,
        });
      }
    }

    // Find predominant pitch (largest area)
    const predominantPitch = pitches.length > 0
      ? pitches.reduce((max, p) => p.areaSqFt > max.areaSqFt ? p : max, pitches[0])
      : null;

    // Calculate unique pitches
    const uniquePitches = [...new Set(pitches.map(p => p.ratio))].sort((a, b) => a - b);

    return {
      totalRoofArea: Math.round(totalAreaSqFt),
      totalRoofSquares: Math.round(totalAreaSqFt / 100 * 10) / 10, // 1 square = 100 sq ft
      totalGroundArea: Math.round(totalGroundAreaSqFt),
      facetCount: roofSegments.length,
      predominantPitch: predominantPitch ? `${predominantPitch.ratio}/12` : null,
      predominantPitchDegrees: predominantPitch?.degrees,
      pitches: uniquePitches.map(p => `${p}/12`),
      roofSegments: roofSegments.map((segment, index) => ({
        id: index + 1,
        pitchDegrees: segment.pitchDegrees,
        pitchRatio: segment.pitchDegrees !== undefined ? this.degreesToPitchRatio(segment.pitchDegrees) : null,
        azimuthDegrees: segment.azimuthDegrees,
        azimuthDirection: segment.azimuthDegrees !== undefined ? this.degreesToCompassDirection(segment.azimuthDegrees) : null,
        areaSqFt: Math.round((segment.stats?.areaMeters2 || 0) * 10.764),
        groundAreaSqFt: Math.round((segment.stats?.groundAreaMeters2 || 0) * 10.764),
        centerHeight: segment.center?.latitude ? segment.planeHeightAtCenterMeters : null,
      })),
      // Building envelope
      maxArrayPanelsCount: solarPotential.maxArrayPanelsCount,
      maxSunshineHoursPerYear: solarPotential.maxSunshineHoursPerYear,
      wholeRoofStats: solarPotential.wholeRoofStats,
    };
  }

  /**
   * Convert degrees to roof pitch ratio (rise/run where run = 12)
   * e.g., 26.57° ≈ 6/12 pitch
   */
  degreesToPitchRatio(degrees) {
    const radians = degrees * Math.PI / 180;
    const ratio = Math.tan(radians) * 12;
    return Math.round(ratio * 10) / 10; // Round to 1 decimal
  }

  /**
   * Convert azimuth degrees to compass direction
   */
  degreesToCompassDirection(degrees) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }

  /**
   * Get data layers from Google Solar API (DSM, RGB, mask)
   */
  async getGoogleSolarDataLayers(lat, lng, radiusMeters = 50, quality = 'HIGH') {
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('Google Maps API key not configured');
    }

    logger.info(`Google Solar: Fetching data layers for ${lat},${lng}`);

    const params = new URLSearchParams({
      'location.latitude': lat.toString(),
      'location.longitude': lng.toString(),
      radiusMeters: radiusMeters.toString(),
      requiredQuality: quality,
      key: GOOGLE_MAPS_API_KEY,
    });

    const response = await fetch(`${GOOGLE_SOLAR_API_BASE}/dataLayers:get?${params}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Google Solar Data Layers API error:', errorText);
      throw new Error(`Google Solar API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      imageryDate: data.imageryDate,
      imageryQuality: data.imageryQuality,
      dsmUrl: data.dsmUrl, // Digital Surface Model
      rgbUrl: data.rgbUrl, // RGB imagery
      maskUrl: data.maskUrl, // Building mask
      annualFluxUrl: data.annualFluxUrl,
      monthlyFluxUrl: data.monthlyFluxUrl,
      hourlyShadeUrls: data.hourlyShadeUrls,
    };
  }

  /**
   * Check Google Solar API status
   */
  async checkGoogleSolarStatus() {
    const status = {
      configured: Boolean(GOOGLE_MAPS_API_KEY),
      connected: false,
      error: null,
    };

    if (!status.configured) {
      status.error = 'Google Maps API key not configured';
      return status;
    }

    try {
      // Test with a known location
      const testLat = 39.0458;
      const testLng = -76.6413;
      await this.getGoogleSolarBuildingInsights(testLat, testLng, 'LOW');
      status.connected = true;
    } catch (error) {
      status.error = error.message;
    }

    return status;
  }

  // ==========================================
  // Combined Instant Measurement
  // ==========================================

  /**
   * Generate instant roof measurement using Google Solar API
   * Falls back to estimates where data is unavailable
   *
   * @param {Object} address - Address object with street, city, state, zip
   * @param {Object} coordinates - Optional pre-geocoded {lat, lng}
   * @param {string} opportunityId - Optional opportunity to link measurement to
   * @param {string} userId - Optional user ID for audit
   * @returns {Object} - Standardized measurement report
   */
  async generateInstantMeasurement(address, coordinates = null, opportunityId = null, userId = null) {
    logger.info(`InstantMeasurement: Starting for ${address.street}, ${address.city}, ${address.state}`);

    // Step 1: Geocode if coordinates not provided
    let lat, lng;
    if (coordinates) {
      lat = coordinates.lat;
      lng = coordinates.lng;
    } else {
      // Use Google Geocoding
      const geocodeResult = await this.geocodeAddress(address);
      lat = geocodeResult.lat;
      lng = geocodeResult.lng;
    }

    logger.info(`InstantMeasurement: Coordinates ${lat},${lng}`);

    // Step 2: Get Google Solar building insights
    let solarData = null;
    let roofStats = null;
    try {
      solarData = await this.getGoogleSolarBuildingInsights(lat, lng, 'HIGH');
      roofStats = solarData.roofStats;
      logger.info(`InstantMeasurement: Google Solar returned ${roofStats?.facetCount || 0} facets`);
    } catch (error) {
      logger.warn(`InstantMeasurement: Google Solar failed - ${error.message}`);
    }

    // Step 3: Get OpenTopography DEM for elevation data (optional enhancement)
    // USGS 1m requires academic access, so we use global DEMs as fallback
    let demData = null;
    try {
      // Try SRTM 1-arc-second (~30m resolution) - always available globally
      demData = await this.getGlobalDEM(lat, lng, 200, 'SRTMGL1');
      logger.info(`InstantMeasurement: OpenTopography SRTM returned ${demData.contentLength} bytes`);
    } catch (error) {
      logger.warn(`InstantMeasurement: OpenTopography failed - ${error.message}`);
    }

    // Step 4: Build standardized measurement report
    const measurement = {
      provider: 'INSTANT_MEASURE',
      generatedAt: new Date().toISOString(),
      address: {
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
      },
      coordinates: { lat, lng },

      // Core measurements from Google Solar
      totalRoofArea: roofStats?.totalRoofArea || null,
      totalRoofSquares: roofStats?.totalRoofSquares || null,
      predominantPitch: roofStats?.predominantPitch || null,
      pitches: roofStats?.pitches || [],
      facets: roofStats?.facetCount || null,

      // Roof segments detail
      roofSegments: roofStats?.roofSegments || [],

      // Linear measurements - estimated from area and facet count
      // (Google Solar doesn't provide these directly, so we estimate)
      ridgeLength: this.estimateRidgeLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      hipLength: this.estimateHipLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      valleyLength: this.estimateValleyLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      rakeLength: this.estimateRakeLength(roofStats?.totalGroundArea, roofStats?.predominantPitch, roofStats?.facetCount),
      eaveLength: this.estimateEaveLength(roofStats?.totalGroundArea),

      // Flashing estimates
      flashingLength: this.estimateFlashingLength(roofStats?.totalGroundArea),
      stepFlashingLength: this.estimateStepFlashingLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      dripEdgeLength: this.estimateDripEdge(roofStats?.totalGroundArea),

      // Complexity
      roofComplexity: this.calculateComplexity(roofStats?.facetCount),
      suggestedWasteFactor: this.calculateWasteFactor(roofStats?.facetCount),

      // Data sources
      sources: {
        googleSolar: solarData ? {
          success: true,
          imageryDate: solarData.imageryDate,
          imageryQuality: solarData.imageryQuality,
        } : { success: false },
        openTopography: demData ? {
          success: true,
          dataset: demData.dataset,
          dataSize: demData.contentLength,
        } : { success: false },
      },

      // Confidence levels
      confidence: {
        area: roofStats ? 'HIGH' : 'NONE',
        pitch: roofStats?.predominantPitch ? 'HIGH' : 'NONE',
        linear: 'ESTIMATED', // Linear measurements are estimated
        overall: roofStats ? 'MEDIUM' : 'LOW',
      },
    };

    // Step 5: Store measurement if opportunityId provided
    // Use upsert pattern: update existing INSTANT_MEASURE record or create new one
    if (opportunityId) {
      try {
        const orderedById = userId ? await this.getUserIdFromCognitoId(userId) : null;

        // Check for existing INSTANT_MEASURE record for this opportunity
        const existingRecord = await prisma.measurementReport.findFirst({
          where: {
            opportunityId,
            provider: 'INSTANT_MEASURE',
          },
          orderBy: { createdAt: 'desc' },
        });

        const measurementData = {
          provider: 'INSTANT_MEASURE',
          orderStatus: 'COMPLETED',
          reportUrl: null, // No PDF for instant measurements
          opportunityId,
          orderedById,
          // Address fields (propertyAddress is required)
          propertyAddress: `${address.street}, ${address.city}, ${address.state} ${address.zip || ''}`.trim(),
          propertyCity: address.city,
          propertyState: address.state,
          propertyZip: address.zip,
          latitude: lat,
          longitude: lng,
          // Measurement data
          totalRoofArea: measurement.totalRoofArea,
          totalRoofSquares: measurement.totalRoofSquares,
          predominantPitch: measurement.predominantPitch,
          pitches: measurement.pitches,
          facets: measurement.facets,
          // Linear measurements (estimated)
          ridgeLength: measurement.ridgeLength,
          hipLength: measurement.hipLength,
          valleyLength: measurement.valleyLength,
          rakeLength: measurement.rakeLength,
          eaveLength: measurement.eaveLength,
          flashingLength: measurement.flashingLength,
          stepFlashingLength: measurement.stepFlashingLength,
          dripEdgeLength: measurement.dripEdgeLength,
          // Complexity and waste
          roofComplexity: measurement.roofComplexity || null, // Ensure valid enum or null
          suggestedWasteFactor: measurement.suggestedWasteFactor,
          rawData: measurement,
          deliveredAt: new Date(), // Use deliveredAt (schema field) instead of completedAt
        };

        let record;
        if (existingRecord) {
          // Update existing record instead of creating duplicate
          record = await prisma.measurementReport.update({
            where: { id: existingRecord.id },
            data: measurementData,
          });
          logger.info(`InstantMeasurement: Updated existing record ${record.id}`);
        } else {
          // Create new record only if none exists
          record = await prisma.measurementReport.create({
            data: measurementData,
          });
          logger.info(`InstantMeasurement: Created new record ${record.id}`);
        }

        measurement.recordId = record.id;
      } catch (error) {
        logger.error(`InstantMeasurement: Failed to store record - ${error.message}`, {
          stack: error.stack,
          opportunityId,
          provider: 'INSTANT_MEASURE',
          roofComplexity: measurement.roofComplexity,
          errorCode: error.code,
        });
      }
    }

    return measurement;
  }

  /**
   * Geocode an address using Google Geocoding API
   */
  async geocodeAddress(address) {
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('Google Maps API key not configured');
    }

    const addressString = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
    const params = new URLSearchParams({
      address: addressString,
      key: GOOGLE_MAPS_API_KEY,
    });

    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);

    if (!response.ok) {
      throw new Error('Geocoding request failed');
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results?.length) {
      throw new Error(`Geocoding failed: ${data.status}`);
    }

    const location = data.results[0].geometry.location;
    return {
      lat: location.lat,
      lng: location.lng,
      formattedAddress: data.results[0].formatted_address,
    };
  }

  // ==========================================
  // gSquare High-Resolution Imagery Integration
  // ==========================================

  /**
   * Check if gSquare API is configured
   */
  isGSquareConfigured() {
    return Boolean(GSQUARE_API_KEY);
  }

  /**
   * Fetch oblique imagery from gSquare for a location
   * Returns imagery URLs for ML processing
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} resolution - 'LOW', 'MEDIUM', 'HIGH'
   * @returns {Object} - Imagery data with URLs for each angle
   */
  async fetchGSquareImagery(lat, lng, resolution = 'HIGH') {
    if (!GSQUARE_API_KEY) {
      throw new Error('gSquare API key not configured');
    }

    logger.info(`gSquare: Fetching imagery for ${lat},${lng} at ${resolution} resolution`);

    const response = await fetch(`${GSQUARE_API_BASE}/imagery/oblique`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GSQUARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        resolution: resolution,
        includeOrtho: true,
        includeOblique: true,
        angles: ['N', 'S', 'E', 'W'], // All cardinal directions
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`gSquare API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    logger.info(`gSquare: Received imagery with ${data.images?.length || 0} views`);

    return {
      requestId: data.requestId,
      captureDate: data.captureDate,
      resolution: data.resolution,
      orthoImage: data.orthoImage, // Top-down view
      obliqueImages: data.obliqueImages || [], // Angled views
      coverage: data.coverage,
      metadata: data.metadata,
    };
  }

  /**
   * Check gSquare coverage for a location
   */
  async checkGSquareCoverage(lat, lng) {
    if (!GSQUARE_API_KEY) {
      return { available: false, reason: 'API key not configured' };
    }

    try {
      const response = await fetch(`${GSQUARE_API_BASE}/coverage/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GSQUARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });

      if (!response.ok) {
        return { available: false, reason: `API error: ${response.status}` };
      }

      const data = await response.json();
      return {
        available: data.hasCoverage,
        latestCapture: data.latestCaptureDate,
        resolution: data.availableResolution,
        provider: 'gSquare',
      };
    } catch (error) {
      return { available: false, reason: error.message };
    }
  }

  // ==========================================
  // Geospan High-Resolution Imagery Integration
  // Alternative provider to gSquare (gpn.dev)
  // ==========================================

  /**
   * Check if Geospan API is configured (async - checks Secrets Manager)
   */
  async isGeospanConfigured() {
    try {
      const apiKey = await getGeospanApiKey();
      return Boolean(apiKey);
    } catch {
      return false;
    }
  }

  /**
   * Submit a Geospan gSquare estimate request
   * Asynchronous API - returns queryKey to poll for results
   * API Docs: https://docs.geospan.com/gsquare/
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {Object} options - Request options
   * @returns {Object} - Query key for polling
   */
  async submitGeospanEstimate(lat, lng, options = {}) {
    const apiKey = await getGeospanApiKey();
    if (!apiKey) {
      throw new Error('Geospan API key not configured');
    }

    const { includeImagery = true, includeWeather = false } = options;

    // Convert lat/lng to WKT POINT format
    const wkt = `POINT(${lng} ${lat})`;

    logger.info(`Geospan: Submitting estimate for ${lat},${lng}`);

    const response = await fetch(`${GEOSPAN_API_BASE}/gsquare/estimate`, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        wkt,
        includeImagery,
        includeWeather,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Geospan API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    logger.info(`Geospan: Estimate submitted, queryKey: ${data.queryKey}`);

    return {
      queryKey: data.queryKey,
      provider: 'geospan',
    };
  }

  /**
   * Poll Geospan gSquare for estimate results
   *
   * @param {string} queryKey - Query key from submitGeospanEstimate
   * @returns {Object} - Estimate results or status
   */
  async pollGeospanEstimate(queryKey) {
    const apiKey = await getGeospanApiKey();
    if (!apiKey) {
      throw new Error('Geospan API key not configured');
    }

    logger.info(`Geospan: Polling for queryKey: ${queryKey}`);

    const response = await fetch(`${GEOSPAN_API_BASE}/gsquare/query/${queryKey}`, {
      method: 'GET',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Geospan API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Handle different states: PENDING, SUCCESS, FAILURE
    if (data.state === 'PENDING') {
      return {
        status: 'PENDING',
        queryKey,
        provider: 'geospan',
      };
    }

    if (data.state === 'FAILURE') {
      return {
        status: 'FAILURE',
        queryKey,
        error: data.error || 'Estimate processing failed',
        provider: 'geospan',
      };
    }

    // SUCCESS - extract results
    const results = data.results || {};
    return {
      status: 'SUCCESS',
      queryKey,
      provider: 'geospan',
      // Roof geometry
      computedFootprint: results.computedFootprint,
      totalArea: results.totalArea, // { area: number, units: 'sqm' }
      totalAreaSqFt: results.totalArea?.area ? results.totalArea.area * 10.7639 : null,
      // Pitch information
      pitch: results.pitchResult?.primaryPitch,
      pitchDeviation: results.pitchResult?.deviation,
      // Confidence score
      confidence: results.confidence,
      // Imagery URLs (if includeImagery was true)
      imagery: results.imagery || [], // Array with nadir and directional views
      // Weather/hail history (if includeWeather was true)
      weather: results.weather || [],
    };
  }

  /**
   * Complete Geospan estimate workflow - submit and poll until complete
   * Polls up to 20 times with 2 second intervals (40 seconds max)
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {Object} options - Request options
   * @returns {Object} - Complete estimate results
   */
  async getGeospanEstimate(lat, lng, options = {}) {
    // Submit the estimate request
    const submitResult = await this.submitGeospanEstimate(lat, lng, options);
    const { queryKey } = submitResult;

    // Poll for results (max 20 attempts, 2 second intervals)
    const maxAttempts = 20;
    const pollInterval = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.pollGeospanEstimate(queryKey);

      if (result.status === 'SUCCESS') {
        logger.info(`Geospan: Estimate completed after ${attempt} attempts`);
        return result;
      }

      if (result.status === 'FAILURE') {
        throw new Error(`Geospan estimate failed: ${result.error}`);
      }

      // Still pending - wait and retry
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error('Geospan estimate timed out after 40 seconds');
  }

  /**
   * Fetch Geospan imagery for ML processing
   * Returns imagery URLs from a Geospan estimate
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {Object} options - Request options
   * @returns {Object} - Imagery data with URLs
   */
  async fetchGeospanImagery(lat, lng, options = {}) {
    // Get estimate with imagery included
    const estimate = await this.getGeospanEstimate(lat, lng, {
      ...options,
      includeImagery: true,
    });

    if (!estimate.imagery || estimate.imagery.length === 0) {
      throw new Error('No imagery available for this location');
    }

    // Parse imagery array - contains nadir and directional (N, E, S, W) views
    const nadirImage = estimate.imagery.find(img => img.direction === 'nadir' || !img.direction);
    const obliqueImages = estimate.imagery.filter(img => img.direction && img.direction !== 'nadir');

    return {
      requestId: estimate.queryKey,
      captureDate: nadirImage?.date || estimate.imagery[0]?.date,
      resolution: nadirImage?.resolution,
      orthoImage: nadirImage ? { url: nadirImage.url, direction: 'nadir' } : null,
      obliqueImages: obliqueImages.map(img => ({
        url: img.url,
        direction: img.direction, // 'north', 'east', 'south', 'west'
      })),
      totalArea: estimate.totalArea,
      pitch: estimate.pitch,
      confidence: estimate.confidence,
      provider: 'geospan',
    };
  }

  /**
   * Check Geospan coverage for a location
   * Submits a quick estimate to see if data is available
   */
  async checkGeospanCoverage(lat, lng) {
    try {
      const apiKey = await getGeospanApiKey();
      if (!apiKey) {
        return { available: false, reason: 'API key not configured', provider: 'geospan' };
      }
    } catch {
      return { available: false, reason: 'API key not configured', provider: 'geospan' };
    }

    try {
      // Submit estimate without imagery (faster)
      const estimate = await this.getGeospanEstimate(lat, lng, {
        includeImagery: false,
        includeWeather: false,
      });

      return {
        available: estimate.status === 'SUCCESS',
        confidence: estimate.confidence,
        totalAreaSqFt: estimate.totalAreaSqFt,
        pitch: estimate.pitch,
        provider: 'geospan',
      };
    } catch (error) {
      return { available: false, reason: error.message, provider: 'geospan' };
    }
  }

  /**
   * Get best available imagery provider for a location
   * Checks both gSquare and Geospan, returns the one with better coverage
   */
  async getBestImageryProvider(lat, lng) {
    const results = {
      gSquare: null,
      geospan: null,
      recommended: null,
    };

    // Check providers in parallel
    const geospanConfigured = await this.isGeospanConfigured();
    const [gSquareResult, geospanResult] = await Promise.allSettled([
      this.isGSquareConfigured() ? this.checkGSquareCoverage(lat, lng) : Promise.resolve(null),
      geospanConfigured ? this.checkGeospanCoverage(lat, lng) : Promise.resolve(null),
    ]);

    if (gSquareResult.status === 'fulfilled' && gSquareResult.value) {
      results.gSquare = gSquareResult.value;
    }
    if (geospanResult.status === 'fulfilled' && geospanResult.value) {
      results.geospan = geospanResult.value;
    }

    // Determine best provider based on confidence score
    if (results.gSquare?.available && results.geospan?.available) {
      // Both available - prefer higher confidence
      const gSquareConf = results.gSquare.confidence || 0;
      const geospanConf = results.geospan.confidence || 0;
      results.recommended = geospanConf > gSquareConf ? 'geospan' : 'gSquare';
    } else if (results.gSquare?.available) {
      results.recommended = 'gSquare';
    } else if (results.geospan?.available) {
      results.recommended = 'geospan';
    } else {
      results.recommended = null;
    }

    return results;
  }

  /**
   * Fetch imagery from the best available provider
   */
  async fetchBestImagery(lat, lng, options = {}) {
    const providers = await this.getBestImageryProvider(lat, lng);

    if (!providers.recommended) {
      throw new Error('No imagery coverage available for this location');
    }

    if (providers.recommended === 'geospan') {
      return this.fetchGeospanImagery(lat, lng, options);
    } else {
      return this.fetchGSquareImagery(lat, lng, options.resolution || 'HIGH');
    }
  }

  /**
   * Get spatial footprints from Geospan for a bounding box
   * Uses the Spatial API for building footprints
   */
  async getGeospanFootprints(minLat, minLng, maxLat, maxLng) {
    const apiKey = await getGeospanApiKey();
    if (!apiKey) {
      throw new Error('Geospan API key not configured');
    }

    logger.info(`Geospan: Fetching footprints for bbox [${minLng},${minLat},${maxLng},${maxLat}]`);

    const response = await fetch(`${GEOSPAN_API_BASE}/spatial/footprints`, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        bbox: [minLng, minLat, maxLng, maxLat],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Geospan Spatial API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      footprints: data.features || data.footprints || [],
      count: data.features?.length || data.count || 0,
      provider: 'geospan',
    };
  }

  // ==========================================
  // ML Roof Analysis Integration
  // ==========================================

  /**
   * Check if ML roof analysis is enabled and configured
   */
  isMLEnabled() {
    return ML_ROOF_ENABLED && Boolean(ML_ROOF_LAMBDA_ARN);
  }

  /**
   * Invoke ML Lambda for roof edge detection and measurement
   * Uses U-Net for semantic segmentation + edge detection
   *
   * @param {Object} imagery - gSquare imagery data
   * @param {Object} solarData - Google Solar data for validation
   * @returns {Object} - ML-derived measurements
   */
  async invokeRoofMLAnalysis(imagery, solarData = null) {
    if (!this.isMLEnabled()) {
      throw new Error('ML roof analysis is not enabled');
    }

    logger.info(`ML: Invoking roof analysis Lambda for request ${imagery.requestId}`);

    const payload = {
      orthoImageUrl: imagery.orthoImage?.url,
      obliqueImageUrls: imagery.obliqueImages?.map(img => img.url) || [],
      captureDate: imagery.captureDate,
      resolution: imagery.resolution,
      // Include Google Solar data for validation/fusion
      solarData: solarData ? {
        totalRoofArea: solarData.roofStats?.totalRoofArea,
        facetCount: solarData.roofStats?.facetCount,
        predominantPitch: solarData.roofStats?.predominantPitch,
        roofSegments: solarData.roofStats?.roofSegments,
      } : null,
      // Configuration
      confidenceThreshold: ML_ROOF_CONFIDENCE_THRESHOLD,
      returnEdgeCoordinates: true,
      returnSegmentationMask: false, // Save bandwidth
    };

    try {
      const command = new InvokeCommand({
        FunctionName: ML_ROOF_LAMBDA_ARN,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);

      // Parse Lambda response
      const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));

      if (responsePayload.errorMessage) {
        throw new Error(`ML Lambda error: ${responsePayload.errorMessage}`);
      }

      const result = responsePayload.body ? JSON.parse(responsePayload.body) : responsePayload;

      logger.info(`ML: Analysis complete - confidence ${result.overallConfidence}`);

      return {
        success: true,
        // Linear measurements from edge detection
        ridgeLength: result.measurements?.ridgeLength,
        hipLength: result.measurements?.hipLength,
        valleyLength: result.measurements?.valleyLength,
        rakeLength: result.measurements?.rakeLength,
        eaveLength: result.measurements?.eaveLength,
        flashingLength: result.measurements?.flashingLength,
        stepFlashingLength: result.measurements?.stepFlashingLength,
        dripEdgeLength: result.measurements?.dripEdgeLength,
        // Area measurements (may improve on Google Solar)
        totalRoofArea: result.measurements?.totalRoofArea,
        facetCount: result.measurements?.facetCount,
        // Confidence scores per measurement
        confidence: result.confidence || {},
        overallConfidence: result.overallConfidence,
        // Edge coordinates for visualization
        edgeCoordinates: result.edgeCoordinates,
        // Processing metadata
        processingTime: result.processingTime,
        modelVersion: result.modelVersion,
      };
    } catch (error) {
      logger.error(`ML: Analysis failed - ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate ML-enhanced measurement using gSquare + ML pipeline
   * This is the premium measurement option with highest accuracy
   *
   * @param {Object} address - Address object
   * @param {Object} coordinates - Optional pre-geocoded coordinates
   * @param {string} opportunityId - Optional opportunity to link to
   * @param {string} userId - Optional user ID for audit
   * @returns {Object} - High-accuracy measurement report
   */
  async generateMLMeasurement(address, coordinates = null, opportunityId = null, userId = null) {
    logger.info(`MLMeasurement: Starting for ${address.street}, ${address.city}, ${address.state}`);

    // Step 1: Geocode if needed
    let lat, lng;
    if (coordinates) {
      lat = coordinates.lat;
      lng = coordinates.lng;
    } else {
      const geocodeResult = await this.geocodeAddress(address);
      lat = geocodeResult.lat;
      lng = geocodeResult.lng;
    }

    // Step 2: Check gSquare coverage
    const coverage = await this.checkGSquareCoverage(lat, lng);
    if (!coverage.available) {
      logger.warn(`MLMeasurement: gSquare coverage not available - ${coverage.reason}`);
      // Fall back to instant measurement
      return this.generateInstantMeasurement(address, { lat, lng }, opportunityId, userId);
    }

    // Step 3: Get Google Solar data for validation/fusion
    let solarData = null;
    try {
      solarData = await this.getGoogleSolarBuildingInsights(lat, lng, 'HIGH');
      logger.info(`MLMeasurement: Got Google Solar data with ${solarData.roofStats?.facetCount} facets`);
    } catch (error) {
      logger.warn(`MLMeasurement: Google Solar failed - ${error.message}`);
    }

    // Step 4: Fetch gSquare imagery
    let imagery = null;
    try {
      imagery = await this.fetchGSquareImagery(lat, lng, 'HIGH');
      logger.info(`MLMeasurement: Got gSquare imagery from ${imagery.captureDate}`);
    } catch (error) {
      logger.warn(`MLMeasurement: gSquare imagery failed - ${error.message}`);
      // Fall back to instant measurement
      return this.generateInstantMeasurement(address, { lat, lng }, opportunityId, userId);
    }

    // Step 5: Run ML analysis
    let mlResult = null;
    if (this.isMLEnabled() && imagery) {
      try {
        mlResult = await this.invokeRoofMLAnalysis(imagery, solarData);
        if (mlResult.success) {
          logger.info(`MLMeasurement: ML analysis successful - confidence ${mlResult.overallConfidence}`);
        }
      } catch (error) {
        logger.warn(`MLMeasurement: ML analysis failed - ${error.message}`);
      }
    }

    // Step 6: Build measurement report with ML data or fallback to estimates
    const roofStats = solarData?.roofStats;
    const useML = mlResult?.success && mlResult.overallConfidence >= ML_ROOF_CONFIDENCE_THRESHOLD;

    const measurement = {
      provider: useML ? 'ML_MEASURE' : 'INSTANT_MEASURE',
      generatedAt: new Date().toISOString(),
      address: {
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
      },
      coordinates: { lat, lng },

      // Core area measurements - prefer ML, fall back to Google Solar
      totalRoofArea: useML && mlResult.totalRoofArea ? mlResult.totalRoofArea : roofStats?.totalRoofArea || null,
      totalRoofSquares: useML && mlResult.totalRoofArea
        ? Math.round(mlResult.totalRoofArea / 100 * 10) / 10
        : roofStats?.totalRoofSquares || null,
      predominantPitch: roofStats?.predominantPitch || null,
      pitches: roofStats?.pitches || [],
      facets: useML && mlResult.facetCount ? mlResult.facetCount : roofStats?.facetCount || null,

      // Roof segments from Google Solar
      roofSegments: roofStats?.roofSegments || [],

      // Linear measurements - ML if available, else estimates
      ridgeLength: useML ? mlResult.ridgeLength : this.estimateRidgeLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      hipLength: useML ? mlResult.hipLength : this.estimateHipLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      valleyLength: useML ? mlResult.valleyLength : this.estimateValleyLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      rakeLength: useML ? mlResult.rakeLength : this.estimateRakeLength(roofStats?.totalGroundArea, roofStats?.predominantPitch, roofStats?.facetCount),
      eaveLength: useML ? mlResult.eaveLength : this.estimateEaveLength(roofStats?.totalGroundArea),

      // Flashing measurements
      flashingLength: useML ? mlResult.flashingLength : this.estimateFlashingLength(roofStats?.totalGroundArea),
      stepFlashingLength: useML ? mlResult.stepFlashingLength : this.estimateStepFlashingLength(roofStats?.totalGroundArea, roofStats?.facetCount),
      dripEdgeLength: useML ? mlResult.dripEdgeLength : this.estimateDripEdge(roofStats?.totalGroundArea),

      // Complexity
      roofComplexity: this.calculateComplexity(roofStats?.facetCount),
      suggestedWasteFactor: this.calculateWasteFactor(roofStats?.facetCount),

      // Data sources
      sources: {
        googleSolar: solarData ? {
          success: true,
          imageryDate: solarData.imageryDate,
          imageryQuality: solarData.imageryQuality,
        } : { success: false },
        gSquare: imagery ? {
          success: true,
          captureDate: imagery.captureDate,
          resolution: imagery.resolution,
        } : { success: false },
        mlAnalysis: mlResult ? {
          success: mlResult.success,
          confidence: mlResult.overallConfidence,
          modelVersion: mlResult.modelVersion,
          processingTime: mlResult.processingTime,
        } : { success: false },
      },

      // Confidence levels - ML provides much higher confidence for linear measurements
      confidence: {
        area: useML && mlResult.confidence?.area >= 0.8 ? 'HIGH' : (roofStats ? 'HIGH' : 'NONE'),
        pitch: roofStats?.predominantPitch ? 'HIGH' : 'NONE',
        linear: useML ? 'HIGH' : 'ESTIMATED',
        overall: useML ? 'HIGH' : (roofStats ? 'MEDIUM' : 'LOW'),
      },

      // ML-specific data
      mlConfidence: mlResult?.confidence || null,
      edgeCoordinates: mlResult?.edgeCoordinates || null,
    };

    // Step 7: Store measurement if opportunityId provided
    // Use upsert pattern: update existing record for same provider or create new one
    if (opportunityId) {
      try {
        const orderedById = userId ? await this.getUserIdFromCognitoId(userId) : null;

        // Check for existing record with same provider for this opportunity
        const existingRecord = await prisma.measurementReport.findFirst({
          where: {
            opportunityId,
            provider: measurement.provider,
          },
          orderBy: { createdAt: 'desc' },
        });

        const measurementData = {
          provider: measurement.provider,
          orderStatus: 'COMPLETED',
          reportUrl: null,
          opportunityId,
          orderedById,
          propertyAddress: `${address.street}, ${address.city}, ${address.state} ${address.zip || ''}`.trim(),
          propertyCity: address.city,
          propertyState: address.state,
          propertyZip: address.zip,
          latitude: lat,
          longitude: lng,
          totalRoofArea: measurement.totalRoofArea,
          totalRoofSquares: measurement.totalRoofSquares,
          predominantPitch: measurement.predominantPitch,
          pitches: measurement.pitches,
          facets: measurement.facets,
          ridgeLength: measurement.ridgeLength,
          hipLength: measurement.hipLength,
          valleyLength: measurement.valleyLength,
          rakeLength: measurement.rakeLength,
          eaveLength: measurement.eaveLength,
          flashingLength: measurement.flashingLength,
          stepFlashingLength: measurement.stepFlashingLength,
          dripEdgeLength: measurement.dripEdgeLength,
          roofComplexity: measurement.roofComplexity || null,
          suggestedWasteFactor: measurement.suggestedWasteFactor,
          rawData: measurement,
          deliveredAt: new Date(), // Use deliveredAt (schema field) instead of completedAt
        };

        let record;
        if (existingRecord) {
          // Update existing record instead of creating duplicate
          record = await prisma.measurementReport.update({
            where: { id: existingRecord.id },
            data: measurementData,
          });
          logger.info(`MLMeasurement: Updated existing record ${record.id}`);
        } else {
          // Create new record only if none exists
          record = await prisma.measurementReport.create({
            data: measurementData,
          });
          logger.info(`MLMeasurement: Created new record ${record.id}`);
        }

        measurement.recordId = record.id;
      } catch (error) {
        logger.error(`MLMeasurement: Failed to store record - ${error.message}`, {
          stack: error.stack,
          opportunityId,
          provider: 'INSTANT_MEASURE',
          roofComplexity: measurement.roofComplexity,
          errorCode: error.code,
        });
      }
    }

    return measurement;
  }

  // ==========================================
  // FREE NAIP-Based Roof Measurement Pipeline
  // ==========================================

  /**
   * Check if NAIP pipeline is enabled
   */
  isNAIPPipelineEnabled() {
    return NAIP_PIPELINE_ENABLED && NAIP_FETCHER_LAMBDA_ARN && ROOF_SEGMENTER_LAMBDA_ARN;
  }

  /**
   * Check NAIP coverage for a location
   * NAIP covers continental US at ~1m/pixel resolution
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<{covered: boolean, years?: string[], resolution?: number}>}
   */
  async checkNAIPCoverage(latitude, longitude) {
    logger.info(`NAIP Coverage Check: Starting for lat=${latitude}, lng=${longitude}`);
    logger.info(`NAIP Coverage Check: NAIP_FETCHER_LAMBDA_ARN = ${NAIP_FETCHER_LAMBDA_ARN}`);

    if (!NAIP_FETCHER_LAMBDA_ARN) {
      logger.error('NAIP Coverage Check: Lambda ARN not configured');
      return { covered: false, error: 'NAIP fetcher Lambda not configured' };
    }

    try {
      const payload = {
        action: 'coverage',
        latitude,
        longitude,
      };

      logger.info(`NAIP Coverage Check: Invoking Lambda with payload: ${JSON.stringify(payload)}`);

      const command = new InvokeCommand({
        FunctionName: NAIP_FETCHER_LAMBDA_ARN,
        Payload: JSON.stringify(payload),
      });

      const response = await lambdaClient.send(command);

      // Log raw response details
      logger.info(`NAIP Coverage Check: Lambda response received`);
      logger.info(`NAIP Coverage Check: FunctionError = ${response.FunctionError || 'none'}`);
      logger.info(`NAIP Coverage Check: StatusCode = ${response.StatusCode}`);

      const payloadString = new TextDecoder().decode(response.Payload);
      logger.info(`NAIP Coverage Check: Raw payload string = ${payloadString}`);

      const responsePayload = JSON.parse(payloadString);
      logger.info(`NAIP Coverage Check: Parsed payload statusCode = ${responsePayload.statusCode}`);
      logger.info(`NAIP Coverage Check: Parsed payload body type = ${typeof responsePayload.body}`);

      if (responsePayload.statusCode === 200) {
        const body = typeof responsePayload.body === 'string'
          ? JSON.parse(responsePayload.body)
          : responsePayload.body;

        logger.info(`NAIP Coverage Check: Body parsed, covered = ${body.covered}`);

        return {
          covered: body.covered,
          availableYears: body.available_years,
          bestResolution: body.best_resolution_m,
          newestDate: body.newest_date,
          state: body.state,
        };
      }

      logger.warn(`NAIP Coverage Check: Non-200 statusCode: ${responsePayload.statusCode}`);
      logger.warn(`NAIP Coverage Check: Response body: ${JSON.stringify(responsePayload.body)}`);
      return { covered: false, error: `Coverage check failed with status ${responsePayload.statusCode}` };
    } catch (error) {
      logger.error(`NAIP coverage check failed: ${error.message}`);
      logger.error(`NAIP coverage check error stack: ${error.stack}`);
      return { covered: false, error: error.message };
    }
  }

  /**
   * Invoke the full NAIP roof measurement pipeline
   * Pipeline: naip_fetcher → roof_segmenter → measurement_calculator → report_generator
   * @param {number} latitude
   * @param {number} longitude
   * @param {Object} address - {street, city, state, zip}
   * @param {Object} options - {widthMeters, heightMeters, generatePdf, opportunityId}
   * @returns {Promise<Object>} Measurement results
   */
  async invokeNAIPPipeline(latitude, longitude, address, options = {}) {
    const { widthMeters = 100, heightMeters = 100, generatePdf = true, opportunityId = null } = options;

    logger.info(`NAIP Pipeline: Starting for ${latitude}, ${longitude}`);

    // Step 1: Fetch NAIP imagery
    logger.info('NAIP Pipeline Step 1: Fetching imagery...');
    const fetchPayload = {
      action: 'fetch',
      latitude,
      longitude,
      width_meters: widthMeters,
      height_meters: heightMeters,
    };

    const fetchCommand = new InvokeCommand({
      FunctionName: NAIP_FETCHER_LAMBDA_ARN,
      Payload: JSON.stringify(fetchPayload),
    });

    const fetchResponse = await lambdaClient.send(fetchCommand);
    const fetchResult = JSON.parse(new TextDecoder().decode(fetchResponse.Payload));

    if (fetchResult.statusCode !== 200) {
      const errorBody = JSON.parse(fetchResult.body || '{}');
      throw new Error(`NAIP fetch failed: ${errorBody.error || 'Unknown error'}`);
    }

    const imageryData = JSON.parse(fetchResult.body);
    logger.info(`NAIP Pipeline: Got imagery from ${imageryData.capture_date}, resolution: ${imageryData.resolution}m`);

    // Step 2: Segment roof from imagery
    logger.info('NAIP Pipeline Step 2: Segmenting roof...');
    const segmentPayload = {
      image_base64: imageryData.image_base64,
      gsd_meters: imageryData.resolution || 1.0,
    };

    const segmentCommand = new InvokeCommand({
      FunctionName: ROOF_SEGMENTER_LAMBDA_ARN,
      Payload: JSON.stringify(segmentPayload),
    });

    const segmentResponse = await lambdaClient.send(segmentCommand);
    const segmentResult = JSON.parse(new TextDecoder().decode(segmentResponse.Payload));

    if (segmentResult.statusCode !== 200) {
      const errorBody = JSON.parse(segmentResult.body || '{}');
      throw new Error(`Roof segmentation failed: ${errorBody.error || 'Unknown error'}`);
    }

    const segmentationData = JSON.parse(segmentResult.body).segmentation;
    logger.info(`NAIP Pipeline: Segmented ${segmentationData.facets?.length || 0} facets, confidence: ${segmentationData.confidence}`);

    // Step 3: Calculate measurements
    logger.info('NAIP Pipeline Step 3: Calculating measurements...');
    const measurePayload = {
      segmentation: segmentationData,
      gsd_meters: imageryData.resolution || 1.0,
      address: {
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
      },
    };

    const measureCommand = new InvokeCommand({
      FunctionName: MEASUREMENT_CALCULATOR_LAMBDA_ARN,
      Payload: JSON.stringify(measurePayload),
    });

    const measureResponse = await lambdaClient.send(measureCommand);
    const measureResult = JSON.parse(new TextDecoder().decode(measureResponse.Payload));

    if (measureResult.statusCode !== 200) {
      const errorBody = JSON.parse(measureResult.body || '{}');
      throw new Error(`Measurement calculation failed: ${errorBody.error || 'Unknown error'}`);
    }

    const measurements = JSON.parse(measureResult.body);
    logger.info(`NAIP Pipeline: Calculated ${measurements.total_area_sqft} sqft total area`);

    // Step 4: Generate PDF report (optional)
    let reportUrl = null;
    if (generatePdf && REPORT_GENERATOR_LAMBDA_ARN) {
      logger.info('NAIP Pipeline Step 4: Generating PDF report...');
      const reportPayload = {
        measurements,
        imagery: {
          base64: imageryData.image_base64,
          capture_date: imageryData.capture_date,
          attribution: imageryData.attribution,
        },
        address,
        latitude,
        longitude,
        segmentation: segmentationData,
        opportunity_id: opportunityId,
        job_id: opportunityId,
      };

      const reportCommand = new InvokeCommand({
        FunctionName: REPORT_GENERATOR_LAMBDA_ARN,
        Payload: JSON.stringify(reportPayload),
      });

      const reportResponse = await lambdaClient.send(reportCommand);
      const reportResult = JSON.parse(new TextDecoder().decode(reportResponse.Payload));

      if (reportResult.statusCode === 200) {
        const reportData = JSON.parse(reportResult.body);
        reportUrl = reportData.report_url;
        logger.info(`NAIP Pipeline: Generated report at ${reportUrl}`);
      } else {
        logger.warn('NAIP Pipeline: PDF generation failed, continuing without report');
      }
    }

    return {
      success: true,
      provider: 'FREE_NAIP',
      confidence: segmentationData.confidence,
      captureDate: imageryData.capture_date,
      resolution: imageryData.resolution,
      attribution: imageryData.attribution || 'USDA NAIP Imagery - Public Domain',
      measurements: {
        totalAreaSqft: measurements.total_area_sqft,
        totalSquares: measurements.total_squares,
        predominantPitch: measurements.predominant_pitch,
        facetCount: measurements.facet_count,
        linear: {
          ridge: measurements.linear?.ridge_ft,
          hip: measurements.linear?.hip_ft,
          valley: measurements.linear?.valley_ft,
          rake: measurements.linear?.rake_ft,
          eave: measurements.linear?.eave_ft,
          dripEdge: measurements.linear?.drip_edge_ft,
          starter: measurements.linear?.starter_ft,
        },
        derived: measurements.derived_quantities,
      },
      facets: measurements.facets,
      reportUrl,
      processingTime: measurements.processing_time_ms,
    };
  }

  /**
   * Invoke NAIP Fetcher Lambda directly
   * Used for debugging/testing imagery fetch separately
   * @param {number} latitude
   * @param {number} longitude
   * @param {Object} options - {widthMeters, heightMeters}
   * @returns {Promise<Object>} Imagery data
   */
  async invokeNAIPFetcher(latitude, longitude, options = {}) {
    const { widthMeters = 100, heightMeters = 100 } = options;

    if (!NAIP_FETCHER_LAMBDA_ARN) {
      throw new Error('NAIP_FETCHER_LAMBDA_ARN not configured');
    }

    const payload = {
      action: 'fetch',
      latitude,
      longitude,
      width_meters: widthMeters,
      height_meters: heightMeters,
    };

    logger.info('Invoking NAIP Fetcher Lambda', { latitude, longitude, widthMeters, heightMeters });

    const command = new InvokeCommand({
      FunctionName: NAIP_FETCHER_LAMBDA_ARN,
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));

    if (result.statusCode !== 200) {
      const errorBody = JSON.parse(result.body || '{}');
      throw new Error(`NAIP fetch failed: ${errorBody.error || 'Unknown error'}`);
    }

    const imageryData = JSON.parse(result.body);
    logger.info('NAIP imagery fetched successfully', {
      captureDate: imageryData.capture_date,
      resolution: imageryData.resolution,
      hasImageData: !!imageryData.image_base64,
    });

    return imageryData;
  }

  /**
   * Invoke Roof Segmenter Lambda directly
   * Used for debugging/testing segmentation separately
   * @param {string} imageBase64 - Base64 encoded image data
   * @param {number} gsdMeters - Ground sample distance in meters
   * @param {Array} buildingFootprint - Optional building outline polygon
   * @returns {Promise<Object>} Segmentation result
   */
  async invokeRoofSegmenter(imageBase64, gsdMeters = 0.3, buildingFootprint = null) {
    if (!ROOF_SEGMENTER_LAMBDA_ARN) {
      throw new Error('ROOF_SEGMENTER_LAMBDA_ARN not configured');
    }

    const payload = {
      image_base64: imageBase64,
      gsd_meters: gsdMeters,
    };

    if (buildingFootprint) {
      payload.building_footprint = buildingFootprint;
    }

    logger.info('Invoking Roof Segmenter Lambda', { gsdMeters, hasFootprint: !!buildingFootprint });

    const command = new InvokeCommand({
      FunctionName: ROOF_SEGMENTER_LAMBDA_ARN,
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));

    if (result.statusCode !== 200) {
      const errorBody = JSON.parse(result.body || '{}');
      throw new Error(`Roof segmentation failed: ${errorBody.error || 'Unknown error'}`);
    }

    const segmentationData = JSON.parse(result.body);
    logger.info('Roof segmentation completed', {
      facetCount: segmentationData.segmentation?.facets?.length || 0,
      edgeCount: segmentationData.segmentation?.edges?.length || 0,
      confidence: segmentationData.segmentation?.confidence,
    });

    return segmentationData;
  }

  /**
   * Generate FREE roof measurement using NAIP pipeline
   * No per-report cost - uses public domain NAIP imagery
   * @param {string} opportunityId
   * @param {Object} options - {address, userId, latitude, longitude}
   * @returns {Promise<Object>} Measurement result
   */
  async generateFreeMeasurement(opportunityId, options = {}) {
    const { address, userId, latitude: providedLat, longitude: providedLng } = options;

    if (!this.isNAIPPipelineEnabled()) {
      return {
        success: false,
        error: 'NAIP pipeline not enabled',
        suggestion: 'Set NAIP_PIPELINE_ENABLED=true and configure Lambda ARNs',
      };
    }

    // Use provided coordinates or geocode address
    let latitude = providedLat;
    let longitude = providedLng;

    if (!latitude || !longitude) {
      // Geocode address to get coordinates
      if (address) {
        const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
        const coordinates = await this.geocodeAddress(fullAddress);
        if (coordinates) {
          latitude = coordinates.latitude;
          longitude = coordinates.longitude;
        }
      }
    }

    if (!latitude || !longitude) {
      return {
        success: false,
        error: 'Could not determine coordinates - provide lat/lng or a valid address',
        address,
      };
    }

    // Check NAIP coverage
    const coverage = await this.checkNAIPCoverage(latitude, longitude);
    if (!coverage.covered) {
      return {
        success: false,
        error: 'No NAIP coverage for this location',
        details: coverage,
        suggestion: 'NAIP covers continental US only. Use EagleView or GAF for this location.',
      };
    }

    try {
      // Run the full pipeline
      const result = await this.invokeNAIPPipeline(latitude, longitude, address, { opportunityId });

      // Check confidence threshold
      if (result.confidence < NAIP_CONFIDENCE_THRESHOLD) {
        logger.warn(`NAIP Pipeline: Low confidence ${result.confidence} < ${NAIP_CONFIDENCE_THRESHOLD}`);
        result.lowConfidence = true;
        result.suggestion = 'Consider ordering EagleView report for more accurate measurements';
      }

      // Store in database if opportunityId provided
      if (opportunityId && result.success) {
        try {
          const measurementData = {
            provider: 'FREE_NAIP',
            orderStatus: 'COMPLETED',
            totalRoofArea: result.measurements.totalAreaSqft,
            totalRoofSquares: result.measurements.totalSquares,
            predominantPitch: result.measurements.predominantPitch,
            roofComplexity: result.facets?.length > 4 ? 'COMPLEX' : result.facets?.length > 2 ? 'MODERATE' : 'SIMPLE',
            measurements: result.measurements,
            facets: result.facets,
            reportPdfUrl: result.reportUrl,
            opportunityId,
            orderedById: userId || null,
            completedAt: new Date(),
            metadata: {
              captureDate: result.captureDate,
              resolution: result.resolution,
              attribution: result.attribution,
              confidence: result.confidence,
              processingTime: result.processingTime,
              pipelineVersion: '1.0',
            },
          };

          // Check if record exists for this opportunity
          const existingRecord = await prisma.measurementReport.findFirst({
            where: {
              opportunityId,
              provider: 'FREE_NAIP',
            },
          });

          let record;
          if (existingRecord) {
            record = await prisma.measurementReport.update({
              where: { id: existingRecord.id },
              data: measurementData,
            });
            logger.info(`NAIP Pipeline: Updated existing record ${record.id}`);
          } else {
            record = await prisma.measurementReport.create({
              data: measurementData,
            });
            logger.info(`NAIP Pipeline: Created new record ${record.id}`);
          }

          result.recordId = record.id;
        } catch (dbError) {
          logger.error(`NAIP Pipeline: Failed to store record - ${dbError.message}`);
        }
      }

      // Transform NAIP response to match frontend expected format
      // Frontend expects flat structure with totalRoofArea, totalRoofSquares, ridgeLength, etc.
      const transformedResult = this.transformNAIPResponseForFrontend(result);
      return transformedResult;
    } catch (error) {
      logger.error(`NAIP Pipeline failed: ${error.message}`, { stack: error.stack });
      return {
        success: false,
        error: error.message,
        suggestion: 'NAIP pipeline failed. Consider using EagleView or GAF for this measurement.',
      };
    }
  }

  /**
   * Check ML and imagery service status
   */
  async checkMLStatus() {
    const geospanConfigured = await this.isGeospanConfigured();
    const status = {
      gSquare: {
        configured: this.isGSquareConfigured(),
        connected: false,
        error: null,
      },
      geospan: {
        configured: geospanConfigured,
        connected: false,
        error: null,
      },
      mlAnalysis: {
        enabled: this.isMLEnabled(),
        lambdaArn: ML_ROOF_LAMBDA_ARN,
        confidenceThreshold: ML_ROOF_CONFIDENCE_THRESHOLD,
      },
      naipPipeline: {
        enabled: this.isNAIPPipelineEnabled(),
        lambdas: {
          naipFetcher: NAIP_FETCHER_LAMBDA_ARN,
          roofSegmenter: ROOF_SEGMENTER_LAMBDA_ARN,
          measurementCalculator: MEASUREMENT_CALCULATOR_LAMBDA_ARN,
          reportGenerator: REPORT_GENERATOR_LAMBDA_ARN,
        },
        confidenceThreshold: NAIP_CONFIDENCE_THRESHOLD,
        connected: false,
        testCoverage: null,
        error: null,
      },
      imageryAvailable: false,
    };

    // Test gSquare connection if configured
    if (status.gSquare.configured) {
      try {
        // Test with a known location (Baltimore area)
        const coverage = await this.checkGSquareCoverage(39.0458, -76.6413);
        status.gSquare.connected = true;
        status.gSquare.testCoverage = coverage;
      } catch (error) {
        status.gSquare.error = error.message;
      }
    }

    // Test Geospan connection if configured
    if (status.geospan.configured) {
      try {
        // Test with a known location (Baltimore area)
        const coverage = await this.checkGeospanCoverage(39.0458, -76.6413);
        status.geospan.connected = true;
        status.geospan.testCoverage = coverage;
      } catch (error) {
        status.geospan.error = error.message;
      }
    }

    // Test NAIP Pipeline connection if enabled
    if (status.naipPipeline.enabled) {
      try {
        // Test NAIP coverage for Baltimore area (should have good coverage)
        const coverage = await this.checkNAIPCoverage(39.0458, -76.6413);
        status.naipPipeline.connected = coverage.covered === true;
        status.naipPipeline.testCoverage = coverage;
      } catch (error) {
        status.naipPipeline.error = error.message;
      }
    }

    // At least one imagery provider must be available for ML measurements
    status.imageryAvailable = status.gSquare.connected || status.geospan.connected;

    // NAIP pipeline is a separate free measurement option
    status.freeMeasurementAvailable = status.naipPipeline.connected;

    return status;
  }

  /**
   * Estimate eave length from ground area (perimeter approximation)
   * Assumes roughly square footprint
   */
  estimateEaveLength(groundAreaSqFt) {
    if (!groundAreaSqFt) return null;
    // Perimeter of square with same area
    const side = Math.sqrt(groundAreaSqFt);
    return Math.round(side * 4);
  }

  /**
   * Estimate drip edge (similar to eave length)
   */
  estimateDripEdge(groundAreaSqFt) {
    return this.estimateEaveLength(groundAreaSqFt);
  }

  /**
   * Estimate ridge length based on roof area
   * Main ridge typically runs along the longest dimension
   * For a gable roof, ridge = ~40% of perimeter's longer side
   */
  estimateRidgeLength(groundAreaSqFt, facetCount) {
    if (!groundAreaSqFt) return null;
    const side = Math.sqrt(groundAreaSqFt);
    // Simple gable has 1 ridge, hip roof has ridge + hips
    // Estimate main ridge as roughly half the building length
    // More facets = shorter main ridge (more complex roof)
    const ridgeFactor = facetCount && facetCount > 4 ? 0.35 : 0.45;
    return Math.round(side * ridgeFactor * 2); // x2 for typical rectangular footprint
  }

  /**
   * Estimate rake length (gable edges on sloped ends)
   * Rakes exist on gable roofs where roof meets the gable wall
   * Adjusted for pitch - steeper pitch = longer rake
   */
  estimateRakeLength(groundAreaSqFt, predominantPitch, facetCount) {
    if (!groundAreaSqFt) return null;
    const side = Math.sqrt(groundAreaSqFt);
    // Rakes are on gable ends - typically 2 per gable
    // Hip roofs have fewer/no rakes
    if (facetCount && facetCount >= 6) {
      // Likely hip roof - fewer rakes
      return Math.round(side * 0.5);
    }
    // Pitch adjustment: steeper pitch = longer rake
    const pitchMultiplier = predominantPitch ? (1 + (predominantPitch / 12) * 0.3) : 1.15;
    // 2 rakes per gable end, assume 2 gable ends
    return Math.round(side * pitchMultiplier * 2);
  }

  /**
   * Estimate hip length based on facet count
   * Hip lines occur where sloped roof planes meet at corners
   */
  estimateHipLength(groundAreaSqFt, facetCount) {
    if (!groundAreaSqFt || !facetCount) return null;
    const side = Math.sqrt(groundAreaSqFt);
    // Simple gable (2-4 facets) = no hips
    if (facetCount <= 4) return 0;
    // Hip roof (4+ facets) has hip lines at corners
    // Each hip runs from eave to ridge at roughly 45 degrees
    const hipCount = Math.min(facetCount - 2, 8); // Estimate number of hips
    const hipLength = side * 0.7; // Each hip is roughly 70% of roof side
    return Math.round(hipCount * hipLength);
  }

  /**
   * Estimate valley length based on facet count
   * Valleys occur where roof planes meet in an inside corner
   */
  estimateValleyLength(groundAreaSqFt, facetCount) {
    if (!groundAreaSqFt || !facetCount) return null;
    const side = Math.sqrt(groundAreaSqFt);
    // Simple roofs have no valleys
    if (facetCount <= 4) return 0;
    // Complex roofs with dormers, additions have valleys
    // Estimate: valleys appear with facet count > 6
    const valleyCount = facetCount > 6 ? Math.floor((facetCount - 6) / 2) : 0;
    const valleyLength = side * 0.6; // Valley is roughly 60% of roof dimension
    return Math.round(valleyCount * valleyLength);
  }

  /**
   * Estimate flashing length (chimney, wall intersections)
   * Based on typical residential construction
   */
  estimateFlashingLength(groundAreaSqFt) {
    if (!groundAreaSqFt) return null;
    // Typical house has 20-40 linear feet of flashing
    // Scale with house size
    const scaleFactor = Math.sqrt(groundAreaSqFt / 2000); // Normalize to 2000 sq ft
    return Math.round(30 * scaleFactor);
  }

  /**
   * Estimate step flashing length (wall-to-roof intersections)
   * Common on additions, dormers, split levels
   */
  estimateStepFlashingLength(groundAreaSqFt, facetCount) {
    if (!groundAreaSqFt) return null;
    // Step flashing increases with roof complexity
    const baseLength = 20; // Base 20 linear feet
    const complexityFactor = facetCount ? Math.min(facetCount / 4, 3) : 1;
    const scaleFactor = Math.sqrt(groundAreaSqFt / 2000);
    return Math.round(baseLength * complexityFactor * scaleFactor);
  }

  /**
   * Calculate roof complexity from facet count
   */
  calculateComplexity(facetCount) {
    if (!facetCount) return 'UNKNOWN';
    if (facetCount <= 4) return 'SIMPLE';
    if (facetCount <= 8) return 'MODERATE';
    if (facetCount <= 15) return 'COMPLEX';
    return 'VERY_COMPLEX';
  }

  /**
   * Calculate suggested waste factor from facet count
   */
  calculateWasteFactor(facetCount) {
    if (!facetCount) return 0.15; // Default 15%
    if (facetCount <= 4) return 0.10; // Simple roof: 10%
    if (facetCount <= 8) return 0.12; // Moderate: 12%
    if (facetCount <= 15) return 0.15; // Complex: 15%
    return 0.18; // Very complex: 18%
  }

  /**
   * Transform NAIP pipeline response to match frontend expected format.
   * Frontend expects flat structure with specific field names.
   * @param {Object} naipResult - Raw result from invokeNAIPPipeline
   * @returns {Object} Transformed result matching frontend expectations
   */
  transformNAIPResponseForFrontend(naipResult) {
    if (!naipResult || !naipResult.success) {
      return naipResult; // Return as-is if failed
    }

    const measurements = naipResult.measurements || {};
    const linear = measurements.linear || {};
    const facets = naipResult.facets || [];
    const facetCount = facets.length || measurements.facetCount || 0;

    // Calculate complexity and waste factor
    const roofComplexity = this.calculateComplexity(facetCount);
    const suggestedWasteFactor = this.calculateWasteFactor(facetCount);

    // Transform facets to roofSegments format expected by frontend
    const roofSegments = facets.map((facet, idx) => {
      // Parse pitch if it's a string like "6/12"
      let pitchDegrees = facet.pitch_degrees;
      let pitchRatio = null;
      if (typeof facet.pitch === 'string' && facet.pitch.includes('/')) {
        const parts = facet.pitch.split('/');
        pitchRatio = parseInt(parts[0], 10);
        pitchDegrees = Math.atan(pitchRatio / 12) * (180 / Math.PI);
      }

      return {
        areaSqFt: facet.area_pixels ? facet.area_pixels * Math.pow(0.3, 2) * 10.764 : facet.area_sqft || 0, // Convert pixels to sqft if needed
        pitchDegrees: pitchDegrees || null,
        pitchRatio: pitchRatio || null,
        direction: facet.aspect_degrees != null
          ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(facet.aspect_degrees / 45) % 8]
          : null,
        azimuthDirection: facet.aspect_degrees || null,
      };
    });

    // Build the transformed result matching frontend expectations
    const transformed = {
      // Core success/metadata
      success: true,
      provider: naipResult.provider || 'FREE_NAIP',
      recordId: naipResult.recordId,

      // Top-level measurements expected by frontend
      totalRoofArea: measurements.totalAreaSqft || 0,
      totalRoofSquares: measurements.totalSquares || 0,
      predominantPitch: measurements.predominantPitch || null,
      facets: facetCount,

      // Linear measurements at top level (frontend expects these)
      ridgeLength: linear.ridge || 0,
      hipLength: linear.hip || 0,
      valleyLength: linear.valley || 0,
      rakeLength: linear.rake || 0,
      eaveLength: linear.eave || 0,
      dripEdgeLength: linear.dripEdge || linear.drip_edge || 0,
      stepFlashingLength: linear.stepFlashing || linear.step_flashing || 0,
      flashingLength: (linear.stepFlashing || linear.step_flashing || 0) + (linear.chimney_flashing || 0),
      starterLength: linear.starter || 0,

      // Complexity and waste factor
      roofComplexity,
      suggestedWasteFactor,

      // Roof segments for facet display
      roofSegments,

      // Imagery metadata
      imageryDate: naipResult.captureDate || null,
      imageryQuality: naipResult.confidence >= 0.85 ? 'HIGH' : naipResult.confidence >= 0.70 ? 'MEDIUM' : 'LOW',

      // Source information for display
      sources: {
        naip: {
          captureDate: naipResult.captureDate,
          resolution: naipResult.resolution || '1m',
          attribution: naipResult.attribution || 'USDA NAIP Imagery - Public Domain',
          imageryQuality: naipResult.confidence >= 0.85 ? 'HIGH' : naipResult.confidence >= 0.70 ? 'MEDIUM' : 'LOW',
          imageryDate: naipResult.captureDate ? {
            year: parseInt(naipResult.captureDate.split('-')[0], 10),
            month: parseInt(naipResult.captureDate.split('-')[1] || '1', 10),
            day: parseInt(naipResult.captureDate.split('-')[2] || '1', 10),
          } : null,
        },
      },

      // Confidence
      confidence: {
        overall: naipResult.confidence || 0,
        areaConfidence: naipResult.confidence || 0,
        pitchConfidence: naipResult.confidence || 0,
      },

      // PDF report URL
      reportUrl: naipResult.reportUrl || null,
      reportPdfUrl: naipResult.reportUrl || null,

      // Processing metadata
      processingTime: naipResult.processingTime || null,
      lowConfidence: naipResult.lowConfidence || false,
      suggestion: naipResult.suggestion || null,

      // Preserve raw measurements for debugging
      _rawMeasurements: measurements,
      _rawFacets: facets,
    };

    logger.info('NAIP Pipeline: Transformed response for frontend', {
      totalRoofArea: transformed.totalRoofArea,
      totalRoofSquares: transformed.totalRoofSquares,
      facetCount,
      hasReportUrl: !!transformed.reportUrl,
    });

    return transformed;
  }
}

export const measurementService = new MeasurementService();
