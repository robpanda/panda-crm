/**
 * Test script for Instant Measurement APIs
 * Tests OpenTopography and Google Solar API integration
 */

// OpenTopography API key
const OPENTOPOGRAPHY_API_KEY = 'da9c1f8476ef69d6842082420c299745';

// Google Maps API key with Solar API enabled
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyDYWtN_izjZbVQaazwNykvyv3YAe6Rs7c4';

// Test address - Real Panda job in Maryland
const TEST_ADDRESS = {
  street: '10208 Shaker Dr',
  city: 'Columbia',
  state: 'MD',
  zip: '21046',
};

// Known coordinates for the test address
const TEST_COORDS = {
  lat: 39.2037,
  lng: -76.8610,
};

async function testGoogleGeocoding() {
  console.log('\n=== Testing Google Geocoding ===');
  const addressString = `${TEST_ADDRESS.street}, ${TEST_ADDRESS.city}, ${TEST_ADDRESS.state} ${TEST_ADDRESS.zip}`;
  const params = new URLSearchParams({
    address: addressString,
    key: GOOGLE_MAPS_API_KEY,
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const data = await response.json();

    if (data.status === 'OK') {
      const location = data.results[0].geometry.location;
      console.log('✓ Geocoding successful');
      console.log(`  Address: ${data.results[0].formatted_address}`);
      console.log(`  Lat: ${location.lat}, Lng: ${location.lng}`);
      return location;
    } else {
      console.log('✗ Geocoding failed:', data.status);
      return null;
    }
  } catch (error) {
    console.log('✗ Geocoding error:', error.message);
    return null;
  }
}

async function testGoogleSolarBuildingInsights(lat, lng) {
  console.log('\n=== Testing Google Solar API - Building Insights ===');
  const params = new URLSearchParams({
    'location.latitude': lat.toString(),
    'location.longitude': lng.toString(),
    requiredQuality: 'HIGH',
    key: GOOGLE_MAPS_API_KEY,
  });

  try {
    const response = await fetch(`https://solar.googleapis.com/v1/buildingInsights:findClosest?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('✗ Google Solar API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('✓ Google Solar API successful');
    console.log(`  Imagery Date: ${data.imageryDate?.year}-${data.imageryDate?.month}-${data.imageryDate?.day}`);
    console.log(`  Imagery Quality: ${data.imageryQuality}`);
    console.log(`  Region: ${data.regionCode}`);

    if (data.solarPotential?.roofSegmentStats) {
      const segments = data.solarPotential.roofSegmentStats;
      console.log(`  Roof Segments: ${segments.length}`);

      // Calculate total area
      let totalArea = 0;
      const pitches = [];
      for (const seg of segments) {
        totalArea += seg.stats?.areaMeters2 || 0;
        if (seg.pitchDegrees !== undefined) {
          pitches.push(seg.pitchDegrees);
        }
      }

      console.log(`  Total Roof Area: ${Math.round(totalArea * 10.764)} sq ft (${Math.round(totalArea * 10.764 / 100)} squares)`);
      console.log(`  Pitches: ${[...new Set(pitches.map(p => Math.round(p)))].join('°, ')}°`);

      // Show first segment details
      if (segments.length > 0) {
        const seg = segments[0];
        console.log('\n  First Segment:');
        console.log(`    Pitch: ${seg.pitchDegrees?.toFixed(1)}° (${Math.round(Math.tan(seg.pitchDegrees * Math.PI / 180) * 12)}/12)`);
        console.log(`    Azimuth: ${seg.azimuthDegrees}°`);
        console.log(`    Area: ${Math.round((seg.stats?.areaMeters2 || 0) * 10.764)} sq ft`);
      }
    }

    return data;
  } catch (error) {
    console.log('✗ Google Solar error:', error.message);
    return null;
  }
}

async function testOpenTopographyCoverage(lat, lng) {
  console.log('\n=== Testing OpenTopography Coverage ===');

  const latOffset = 0.0001;
  const lngOffset = 0.0001;

  for (const dataset of ['USGS1m', 'USGS10m', 'USGS30m']) {
    const params = new URLSearchParams({
      datasetName: dataset,
      south: (lat - latOffset).toFixed(6),
      north: (lat + latOffset).toFixed(6),
      west: (lng - lngOffset).toFixed(6),
      east: (lng + lngOffset).toFixed(6),
      outputFormat: 'GTiff',
      API_Key: OPENTOPOGRAPHY_API_KEY,
    });

    try {
      const response = await fetch(`https://portal.opentopography.org/API/usgsdem?${params}`);
      const contentLength = response.headers.get('content-length');
      const hasData = response.ok && parseInt(contentLength || '0') > 0;
      console.log(`  ${dataset}: ${hasData ? '✓ Available' : '✗ Not available'} (${contentLength || 0} bytes)`);
    } catch (error) {
      console.log(`  ${dataset}: ✗ Error - ${error.message}`);
    }
  }
}

async function testOpenTopographyDEM(lat, lng) {
  console.log('\n=== Testing OpenTopography DEM Download ===');

  // Use larger area to meet minimum requirements (0.1 km2 = 100m x 100m minimum)
  const radius = 200; // meters (about 500m x 500m bounding box)
  const latOffset = radius / 111320;
  const lngOffset = radius / (111320 * Math.cos(lat * Math.PI / 180));

  // Test different datasets
  for (const dataset of ['USGS1m', 'USGS10m', 'USGS30m']) {
    const params = new URLSearchParams({
      datasetName: dataset,
      south: (lat - latOffset).toFixed(6),
      north: (lat + latOffset).toFixed(6),
      west: (lng - lngOffset).toFixed(6),
      east: (lng + lngOffset).toFixed(6),
      outputFormat: 'GTiff',
      API_Key: OPENTOPOGRAPHY_API_KEY,
    });

    try {
      const response = await fetch(`https://portal.opentopography.org/API/usgsdem?${params}`);

      if (response.ok) {
        const contentLength = response.headers.get('content-length');
        console.log(`  ${dataset}: ✓ ${contentLength} bytes`);
      } else {
        const errorText = await response.text();
        // Extract error message
        const errorMatch = errorText.match(/<error>([^<]+)<\/error>/);
        console.log(`  ${dataset}: ✗ ${errorMatch ? errorMatch[1].substring(0, 80) : response.status}`);
      }
    } catch (error) {
      console.log(`  ${dataset}: ✗ ${error.message}`);
    }
  }

  // Also test globaldem endpoint (SRTM, ALOS, etc.)
  console.log('\n=== Testing OpenTopography Global DEM ===');
  for (const demtype of ['SRTMGL1', 'SRTMGL3', 'AW3D30']) {
    const params = new URLSearchParams({
      demtype: demtype,
      south: (lat - latOffset).toFixed(6),
      north: (lat + latOffset).toFixed(6),
      west: (lng - lngOffset).toFixed(6),
      east: (lng + lngOffset).toFixed(6),
      outputFormat: 'GTiff',
      API_Key: OPENTOPOGRAPHY_API_KEY,
    });

    try {
      const response = await fetch(`https://portal.opentopography.org/API/globaldem?${params}`);

      if (response.ok) {
        const contentLength = response.headers.get('content-length');
        console.log(`  ${demtype}: ✓ ${contentLength} bytes`);
      } else {
        const errorText = await response.text();
        const errorMatch = errorText.match(/<error>([^<]+)<\/error>/);
        console.log(`  ${demtype}: ✗ ${errorMatch ? errorMatch[1].substring(0, 80) : response.status}`);
      }
    } catch (error) {
      console.log(`  ${demtype}: ✗ ${error.message}`);
    }
  }
}

async function main() {
  console.log('========================================');
  console.log('INSTANT MEASUREMENT API TEST');
  console.log('========================================');
  console.log(`Test Address: ${TEST_ADDRESS.street}, ${TEST_ADDRESS.city}, ${TEST_ADDRESS.state}`);

  // Step 1: Geocode
  const location = await testGoogleGeocoding();
  const lat = location?.lat || TEST_COORDS.lat;
  const lng = location?.lng || TEST_COORDS.lng;

  // Step 2: Test Google Solar
  await testGoogleSolarBuildingInsights(lat, lng);

  // Step 3: Test OpenTopography coverage
  await testOpenTopographyCoverage(lat, lng);

  // Step 4: Test DEM download
  await testOpenTopographyDEM(lat, lng);

  console.log('\n========================================');
  console.log('TEST COMPLETE');
  console.log('========================================');
}

main().catch(console.error);
