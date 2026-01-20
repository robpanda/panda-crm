#!/usr/bin/env node
/**
 * Local test script for Roof Measurement Report PDF generation
 * This test generates the PDF locally without S3 upload
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';

// Brand colors
const COLORS = {
  primary: rgb(0.4, 0.49, 0.92), // #667eea - Panda purple
  secondary: rgb(0.46, 0.29, 0.64), // #764ba2
  dark: rgb(0.1, 0.1, 0.1),
  gray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.9, 0.9, 0.9),
  success: rgb(0.13, 0.55, 0.13),
  danger: rgb(0.8, 0.2, 0.2),
};

const COMPANY_INFO = {
  name: 'Panda Exteriors',
  address: '8825 Stanford Blvd Suite 201',
  cityStateZip: 'Columbia, MD 21045',
  phone: '(240) 801-6665',
  email: 'info@pandaexteriors.com',
  website: 'www.pandaexteriors.com',
};

// Sample measurement data from the roof analysis pipeline
const measurementData = {
  total_area_sqft: 2547.8,
  roof_squares: 25.5,
  predominant_pitch: '6/12',
  facet_count: 4,

  // Linear measurements
  ridge: { length_ft: 42.5, confidence: 'HIGH' },
  hip: { length_ft: 28.3, confidence: 'HIGH' },
  valley: { length_ft: 15.2, confidence: 'ESTIMATED' },
  eave: { length_ft: 124.6, confidence: 'HIGH' },
  rake: { length_ft: 68.4, confidence: 'HIGH' },
  drip_edge: { length_ft: 193.0, confidence: 'ESTIMATED' },
  starter: { length_ft: 124.6, confidence: 'HIGH' },
  step_flashing: { length_ft: 32.0, confidence: 'ESTIMATED' },

  // Material recommendations
  recommended_shingles_squares: 28.0,
  recommended_underlayment_sqft: 2800,
  recommended_ridge_cap_lf: 70.8,
  recommended_drip_edge_lf: 193.0,
  recommended_starter_lf: 124.6,
  recommended_ice_water_sqft: 250,

  // Warnings
  warnings: [
    'Steep pitch (6/12) may require additional safety equipment',
    'Valley length is estimated due to image resolution'
  ]
};

const options = {
  address: {
    street: '123 Test Street',
    city: 'Owings Mills',
    state: 'MD',
    zip: '21117'
  },
  opportunityId: 'test-opp-12345',
  imagery: {
    year: 2023,
    resolution: 0.3,
    source: 'NAIP'
  },
  location: {
    latitude: 39.4209,
    longitude: -76.7827
  },
  includeImageryPage: true, // Enable aerial imagery page
};

// Create a simple test aerial image (solid color PNG for testing)
// In production, this would be actual NAIP imagery from the pipeline
function createTestAerialImage() {
  // This creates a minimal valid PNG (1x1 pixel, gray) for testing structure
  // Real usage would pass actual aerial imagery from NAIP fetcher Lambda
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, // 100x100 pixels
    0x08, 0x02, 0x00, 0x00, 0x00, 0xFF, 0x80, 0x02, 0x03,
  ]);
  // For actual testing, we'll skip the image if we can't create a valid one
  return null; // Return null to test graceful handling
}

async function generateRoofReportPdf() {
  console.log('='.repeat(60));
  console.log('ROOF MEASUREMENT REPORT PDF GENERATION TEST');
  console.log('='.repeat(60));
  console.log();

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size

  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let yPosition = height - 50;

  // Helper function to draw text
  const drawText = (text, x, y, opts = {}) => {
    page.drawText(text, {
      x,
      y,
      size: opts.size || 10,
      font: opts.bold ? helveticaBold : helvetica,
      color: opts.color || COLORS.dark,
    });
  };

  // === HEADER ===
  drawText(COMPANY_INFO.name, 50, yPosition, { size: 24, bold: true, color: COLORS.primary });
  yPosition -= 20;
  drawText(`${COMPANY_INFO.address}  |  ${COMPANY_INFO.cityStateZip}`, 50, yPosition, { size: 9, color: COLORS.gray });
  yPosition -= 12;
  drawText(`${COMPANY_INFO.phone}  |  ${COMPANY_INFO.email}`, 50, yPosition, { size: 9, color: COLORS.gray });
  yPosition -= 30;

  // Title
  drawText('ROOF MEASUREMENT REPORT', 50, yPosition, { size: 18, bold: true, color: COLORS.primary });
  yPosition -= 15;

  // Report date
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  drawText(`Generated: ${reportDate}`, 50, yPosition, { size: 9, color: COLORS.gray });
  yPosition -= 30;

  // === PROPERTY ADDRESS ===
  if (options.address) {
    page.drawRectangle({
      x: 50,
      y: yPosition - 50,
      width: width - 100,
      height: 60,
      color: rgb(0.96, 0.96, 0.98),
      borderColor: COLORS.primary,
      borderWidth: 1,
    });

    drawText('Property Address', 60, yPosition - 5, { size: 10, bold: true, color: COLORS.primary });
    drawText(options.address.street || '', 60, yPosition - 20, { size: 12, bold: true });
    drawText(`${options.address.city || ''}, ${options.address.state || ''} ${options.address.zip || ''}`, 60, yPosition - 35, { size: 11 });

    if (options.location) {
      drawText(`Coordinates: ${options.location.latitude.toFixed(4)}, ${options.location.longitude.toFixed(4)}`, 350, yPosition - 35, { size: 8, color: COLORS.gray });
    }
    yPosition -= 70;
  }

  // === ROOF SUMMARY BOX ===
  const summaryBoxY = yPosition - 80;
  page.drawRectangle({
    x: 50,
    y: summaryBoxY,
    width: width - 100,
    height: 90,
    color: rgb(0.95, 0.97, 1),
    borderColor: COLORS.primary,
    borderWidth: 1,
  });

  drawText('ROOF SUMMARY', 60, yPosition - 5, { size: 12, bold: true, color: COLORS.primary });

  // Summary grid
  const summaryItems = [
    { label: 'Total Roof Area', value: `${measurementData.total_area_sqft?.toFixed(1) || 'N/A'} sq ft` },
    { label: 'Roof Squares', value: `${measurementData.roof_squares?.toFixed(1) || 'N/A'}` },
    { label: 'Predominant Pitch', value: measurementData.predominant_pitch || 'N/A' },
    { label: 'Facet Count', value: `${measurementData.facet_count || 'N/A'}` },
  ];

  const colWidth = (width - 120) / 4;
  summaryItems.forEach((item, i) => {
    const x = 60 + (i * colWidth);
    drawText(item.label, x, yPosition - 30, { size: 8, color: COLORS.gray });
    drawText(item.value, x, yPosition - 45, { size: 14, bold: true, color: COLORS.dark });
  });

  yPosition = summaryBoxY - 20;

  // === LINEAR MEASUREMENTS TABLE ===
  drawText('LINEAR MEASUREMENTS', 50, yPosition, { size: 12, bold: true, color: COLORS.primary });
  yPosition -= 20;

  // Table header
  page.drawRectangle({
    x: 50,
    y: yPosition - 15,
    width: width - 100,
    height: 20,
    color: COLORS.primary,
  });
  drawText('Measurement', 60, yPosition - 10, { size: 9, bold: true, color: rgb(1, 1, 1) });
  drawText('Length (ft)', 250, yPosition - 10, { size: 9, bold: true, color: rgb(1, 1, 1) });
  drawText('Confidence', 400, yPosition - 10, { size: 9, bold: true, color: rgb(1, 1, 1) });
  yPosition -= 20;

  // Linear measurement rows
  const linearMeasurements = [
    { name: 'Ridge', data: measurementData.ridge },
    { name: 'Hip', data: measurementData.hip },
    { name: 'Valley', data: measurementData.valley },
    { name: 'Eave', data: measurementData.eave },
    { name: 'Rake', data: measurementData.rake },
    { name: 'Drip Edge', data: measurementData.drip_edge },
    { name: 'Starter', data: measurementData.starter },
    { name: 'Step Flashing', data: measurementData.step_flashing },
  ];

  linearMeasurements.forEach((m, i) => {
    const rowY = yPosition - (i * 18);
    if (i % 2 === 0) {
      page.drawRectangle({
        x: 50,
        y: rowY - 12,
        width: width - 100,
        height: 18,
        color: rgb(0.98, 0.98, 0.98),
      });
    }

    drawText(m.name, 60, rowY - 8, { size: 9 });

    if (m.data && typeof m.data === 'object') {
      drawText(`${m.data.length_ft?.toFixed(1) || '0.0'}`, 250, rowY - 8, { size: 9, bold: true });
      const conf = m.data.confidence || 'N/A';
      const confColor = conf === 'HIGH' ? COLORS.success : conf === 'ESTIMATED' ? rgb(0.8, 0.6, 0.2) : COLORS.gray;
      drawText(conf, 400, rowY - 8, { size: 8, color: confColor });
    } else {
      drawText('N/A', 250, rowY - 8, { size: 9, color: COLORS.gray });
    }
  });

  yPosition -= (linearMeasurements.length * 18) + 30;

  // === MATERIAL RECOMMENDATIONS ===
  drawText('MATERIAL RECOMMENDATIONS', 50, yPosition, { size: 12, bold: true, color: COLORS.primary });
  yPosition -= 20;

  const materials = [
    { name: 'Shingles', value: measurementData.recommended_shingles_squares, unit: 'squares' },
    { name: 'Underlayment', value: measurementData.recommended_underlayment_sqft, unit: 'sq ft' },
    { name: 'Ridge Cap', value: measurementData.recommended_ridge_cap_lf, unit: 'linear ft' },
    { name: 'Drip Edge', value: measurementData.recommended_drip_edge_lf, unit: 'linear ft' },
    { name: 'Starter Strip', value: measurementData.recommended_starter_lf, unit: 'linear ft' },
    { name: 'Ice & Water Shield', value: measurementData.recommended_ice_water_sqft, unit: 'sq ft' },
  ];

  // Two columns
  materials.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col === 0 ? 60 : 320;
    const y = yPosition - (row * 18);

    drawText(`${m.name}:`, x, y, { size: 9 });
    if (m.value) {
      drawText(`${m.value.toFixed(1)} ${m.unit}`, x + 120, y, { size: 9, bold: true });
    } else {
      drawText('N/A', x + 120, y, { size: 9, color: COLORS.gray });
    }
  });

  yPosition -= (Math.ceil(materials.length / 2) * 18) + 30;

  // === WARNINGS ===
  if (measurementData.warnings && measurementData.warnings.length > 0) {
    drawText('WARNINGS', 50, yPosition, { size: 12, bold: true, color: COLORS.danger });
    yPosition -= 15;

    measurementData.warnings.forEach((warning) => {
      drawText(`• ${warning}`, 60, yPosition, { size: 9, color: COLORS.danger });
      yPosition -= 14;
    });
    yPosition -= 10;
  }

  // === IMAGERY INFO ===
  if (options.imagery) {
    drawText('IMAGERY SOURCE', 50, yPosition, { size: 10, bold: true, color: COLORS.gray });
    yPosition -= 15;
    drawText(`Source: ${options.imagery.source || 'Unknown'}  |  Year: ${options.imagery.year || 'N/A'}  |  Resolution: ${options.imagery.resolution ? `${options.imagery.resolution}m/px` : 'N/A'}`, 50, yPosition, { size: 8, color: COLORS.gray });
    yPosition -= 20;
  }

  // === FOOTER ===
  const footerY = 40;
  page.drawLine({
    start: { x: 50, y: footerY + 20 },
    end: { x: width - 50, y: footerY + 20 },
    thickness: 0.5,
    color: COLORS.lightGray,
  });

  drawText('This report was generated automatically using aerial imagery analysis.', 50, footerY + 5, { size: 7, color: COLORS.gray });
  drawText('Measurements are estimates and should be verified on-site before ordering materials.', 50, footerY - 5, { size: 7, color: COLORS.gray });
  drawText(`© ${new Date().getFullYear()} ${COMPANY_INFO.name}`, width - 150, footerY - 5, { size: 7, color: COLORS.gray });

  // === PAGE 2: AERIAL IMAGERY (if enabled) ===
  if (options.includeImageryPage) {
    const page2 = pdfDoc.addPage([612, 792]);
    let y2 = height - 50;

    // Helper for page 2
    const drawText2 = (text, x, y, opts = {}) => {
      page2.drawText(text, {
        x,
        y,
        size: opts.size || 10,
        font: opts.bold ? helveticaBold : helvetica,
        color: opts.color || COLORS.dark,
      });
    };

    // Page 2 Header
    drawText2(COMPANY_INFO.name, 50, y2, { size: 18, bold: true, color: COLORS.primary });
    y2 -= 25;
    drawText2('AERIAL IMAGERY', 50, y2, { size: 14, bold: true, color: COLORS.primary });
    y2 -= 15;

    // Property address on page 2
    if (options.address) {
      drawText2(`${options.address.street}, ${options.address.city}, ${options.address.state} ${options.address.zip}`, 50, y2, { size: 10 });
      y2 -= 25;
    }

    // Imagery info box
    page2.drawRectangle({
      x: 50,
      y: y2 - 80,
      width: width - 100,
      height: 90,
      color: rgb(0.96, 0.96, 0.98),
      borderColor: COLORS.primary,
      borderWidth: 1,
    });

    drawText2('Imagery Details', 60, y2 - 10, { size: 11, bold: true, color: COLORS.primary });
    drawText2(`Source: ${options.imagery?.source || 'NAIP'}`, 60, y2 - 30, { size: 9 });
    drawText2(`Year: ${options.imagery?.year || 'N/A'}`, 60, y2 - 45, { size: 9 });
    drawText2(`Resolution: ${options.imagery?.resolution ? `${options.imagery.resolution}m/pixel` : 'N/A'}`, 60, y2 - 60, { size: 9 });

    if (options.location) {
      drawText2(`Coordinates: ${options.location.latitude.toFixed(6)}, ${options.location.longitude.toFixed(6)}`, 300, y2 - 30, { size: 9 });
    }

    y2 -= 100;

    // Placeholder for aerial image
    // In production, actual NAIP imagery would be embedded here
    const imageBoxY = y2 - 350;
    const imageBoxHeight = 340;
    const imageBoxWidth = width - 100;

    // Draw placeholder box for aerial image
    page2.drawRectangle({
      x: 50,
      y: imageBoxY,
      width: imageBoxWidth,
      height: imageBoxHeight,
      color: rgb(0.95, 0.95, 0.95),
      borderColor: COLORS.gray,
      borderWidth: 1,
    });

    // Center text in placeholder
    const placeholderText = 'Aerial Image Placeholder';
    const subText = '(NAIP imagery would be embedded here in production)';
    drawText2(placeholderText, 50 + (imageBoxWidth / 2) - 80, imageBoxY + (imageBoxHeight / 2) + 10, { size: 12, color: COLORS.gray });
    drawText2(subText, 50 + (imageBoxWidth / 2) - 140, imageBoxY + (imageBoxHeight / 2) - 10, { size: 9, color: COLORS.gray });

    y2 = imageBoxY - 20;

    // Segmentation Legend
    drawText2('ROOF SEGMENTATION LEGEND', 50, y2, { size: 11, bold: true, color: COLORS.primary });
    y2 -= 20;

    const legendItems = [
      { color: rgb(0.4, 0.6, 0.9), label: 'Roof Facets' },
      { color: rgb(1, 0.4, 0.4), label: 'Ridge Lines' },
      { color: rgb(0.4, 0.8, 0.4), label: 'Hip Lines' },
      { color: rgb(1, 0.8, 0.2), label: 'Valley Lines' },
      { color: rgb(0.6, 0.4, 0.8), label: 'Eave/Rake Edges' },
    ];

    let legendX = 60;
    legendItems.forEach((item, i) => {
      page2.drawRectangle({
        x: legendX,
        y: y2 - 5,
        width: 15,
        height: 15,
        color: item.color,
      });
      drawText2(item.label, legendX + 20, y2, { size: 8 });
      legendX += 100;
    });

    y2 -= 40;

    // Measurement summary on page 2
    drawText2('QUICK REFERENCE', 50, y2, { size: 11, bold: true, color: COLORS.primary });
    y2 -= 18;

    const quickRef = [
      `Total Area: ${measurementData.total_area_sqft.toFixed(0)} sq ft`,
      `Roof Squares: ${measurementData.roof_squares.toFixed(1)}`,
      `Pitch: ${measurementData.predominant_pitch}`,
      `Facets: ${measurementData.facet_count}`,
    ];

    quickRef.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      drawText2(item, 60 + (col * 250), y2 - (row * 15), { size: 9 });
    });

    // Page 2 Footer
    page2.drawLine({
      start: { x: 50, y: footerY + 20 },
      end: { x: width - 50, y: footerY + 20 },
      thickness: 0.5,
      color: COLORS.lightGray,
    });
    drawText2('Page 2 of 2 - Aerial Imagery', 50, footerY + 5, { size: 7, color: COLORS.gray });
    drawText2(`© ${new Date().getFullYear()} ${COMPANY_INFO.name}`, width - 150, footerY - 5, { size: 7, color: COLORS.gray });

    console.log('Page 2 (Aerial Imagery) added to PDF');
  }

  // Save PDF
  const pdfBytes = await pdfDoc.save();

  // Write to local file
  const outputPath = '/tmp/roof-measurement-report.pdf';
  fs.writeFileSync(outputPath, pdfBytes);

  console.log('SUCCESS! PDF Generated');
  console.log('-'.repeat(40));
  console.log(`PDF saved to: ${outputPath}`);
  console.log(`PDF size: ${pdfBytes.length} bytes`);
  console.log(`Pages: ${options.includeImageryPage ? 2 : 1}`);
  console.log();
  console.log('Summary:');
  console.log(`  Total Area: ${measurementData.total_area_sqft} sq ft`);
  console.log(`  Roof Squares: ${measurementData.roof_squares}`);
  console.log(`  Pitch: ${measurementData.predominant_pitch}`);
  console.log(`  Facets: ${measurementData.facet_count}`);
  console.log(`  Aerial Imagery Page: ${options.includeImageryPage ? 'Yes' : 'No'}`);
  console.log();
  console.log(`Open the PDF: open ${outputPath}`);
}

generateRoofReportPdf().catch(console.error);
