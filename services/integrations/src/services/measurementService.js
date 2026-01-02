// EagleView, GAF QuickMeasure & Hover Integration Service
// Handles ordering, receiving, and processing measurement reports
// Also supports Hover 3D modeling and design visualization
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

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
const HOVER_REDIRECT_URI = process.env.HOVER_REDIRECT_URI || 'https://bamboo.pandaadmin.com/api/integrations/hover/callback';

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
    const typeMap = {
      'QuickMeasureResidentialSingleFamily': 'RESIDENTIAL_SINGLE',
      'ResidentialMultiFamily': 'RESIDENTIAL_MULTI',
      'Commercial': 'COMMERCIAL',
    };
    return typeMap[type] || 'RESIDENTIAL_SINGLE';
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

    try {
      // Create pending measurement report
      const report = await prisma.measurementReport.create({
        data: {
          provider: 'HOVER',
          reportType: captureType.toUpperCase(),
          orderStatus: 'PENDING',
          propertyAddress: address || opportunity.street,
          propertyCity: city || opportunity.city,
          propertyState: state || opportunity.state,
          propertyZip: zip || opportunity.postalCode,
          opportunityId,
          accountId: opportunity.accountId,
          orderedById: userId,
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
}

export const measurementService = new MeasurementService();
