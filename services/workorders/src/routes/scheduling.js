import { Router } from 'express';
import {
  // Original endpoints
  autoScheduleAppointment,
  findAvailableSlots,
  getDispatchBoard,
  optimizeSchedule,
  // Geocoding endpoints
  geocodeAddress,
  geocodeAccount,
  geocodeAppointment,
  batchGeocodeAccounts,
  batchGeocodeAppointments,
  // Distance/route endpoints
  calculateDistance,
  findNearbyAppointments,
  suggestTimeSlots,
  // Scheduling policy endpoints
  getSchedulingPolicies,
  getActivePolicy,
  upsertPolicy,
  // Resource matching endpoints
  checkSkillMatch,
  checkTerritoryMatch,
  getResourceUtilization,
  findBestResources,
  // Smart auto-scheduling
  smartAutoSchedule,
  batchAutoSchedule,
  // Capacity planning
  getResourceCapacity,
  updateResourceCapacity,
  getTeamCapacity,
  // Crew selection
  getCrewCandidates,
} from '../controllers/schedulingController.js';

const router = Router();

// ============================================
// ORIGINAL ENDPOINTS
// ============================================

// Auto-schedule (replicates SelfGenAutoScheduler)
router.post('/auto-schedule', autoScheduleAppointment);

// Find available slots
router.post('/available-slots', findAvailableSlots);

// Dispatch board
router.get('/dispatch-board', getDispatchBoard);

// Optimize route for a resource
router.post('/optimize', optimizeSchedule);

// ============================================
// GEOCODING ENDPOINTS (FSL-equivalent)
// ============================================

// Geocode a single address
router.post('/geocode', geocodeAddress);

// Geocode an account
router.post('/geocode/account/:accountId', geocodeAccount);

// Geocode an appointment
router.post('/geocode/appointment/:appointmentId', geocodeAppointment);

// Batch geocode accounts
router.post('/geocode/accounts/batch', batchGeocodeAccounts);

// Batch geocode appointments
router.post('/geocode/appointments/batch', batchGeocodeAppointments);

// ============================================
// DISTANCE & ROUTE ENDPOINTS
// ============================================

// Calculate distance between two points
router.post('/distance', calculateDistance);

// Find appointments within radius
router.post('/appointments/nearby', findNearbyAppointments);

// Suggest optimal time slots
router.post('/appointments/suggest-slots', suggestTimeSlots);

// ============================================
// SCHEDULING POLICY ENDPOINTS
// ============================================

// Get all scheduling policies
router.get('/policies', getSchedulingPolicies);

// Get active policy
router.get('/policies/active', getActivePolicy);

// Create or update policy
router.post('/policies', upsertPolicy);

// ============================================
// RESOURCE MATCHING ENDPOINTS
// ============================================

// Check skill match for resource and work type
router.get('/resources/:resourceId/skill-match/:workTypeId', checkSkillMatch);

// Check territory match for resource
router.get('/resources/:resourceId/territory-match/:territoryId', checkTerritoryMatch);

// Get resource utilization
router.get('/resources/:resourceId/utilization', getResourceUtilization);

// Find best resources for an appointment
router.get('/appointments/:appointmentId/best-resources', findBestResources);

// ============================================
// SMART AUTO-SCHEDULING ENDPOINTS
// ============================================

// Smart auto-schedule single appointment (uses policy engine)
router.post('/appointments/:appointmentId/smart-schedule', smartAutoSchedule);

// Batch auto-schedule multiple appointments
router.post('/appointments/batch-schedule', batchAutoSchedule);

// ============================================
// CAPACITY PLANNING ENDPOINTS
// ============================================

// Get resource capacity for date range
router.get('/capacity/:resourceId', getResourceCapacity);

// Update resource capacity
router.post('/capacity/:resourceId', updateResourceCapacity);

// Get team capacity by territory
router.get('/capacity/team/:territoryId', getTeamCapacity);

// ============================================
// CREW SELECTION ENDPOINTS
// ============================================

// Get crew candidates for new appointment booking
router.post('/candidates', getCrewCandidates);

export default router;
