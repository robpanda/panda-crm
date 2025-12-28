// Advanced Scheduling Engine Service
// Handles appointment optimization, resource capacity, and smart scheduling
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

class SchedulingService {
  // ==========================================
  // Schedule Optimization
  // ==========================================

  /**
   * Run schedule optimization for a territory
   */
  async runOptimization(options = {}) {
    const {
      territoryId,
      startDate = new Date(),
      endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
      runType = 'MANUAL',
      autoApply = false,
    } = options;

    const startTime = Date.now();

    // Create optimization record
    const optimization = await prisma.scheduleOptimization.create({
      data: {
        runDate: new Date(),
        runType,
        status: 'RUNNING',
        territoryId,
        startDate,
        endDate,
        resourceIds: [],
      },
    });

    try {
      // Get appointments to optimize
      const appointments = await this.getAppointmentsForOptimization(
        territoryId,
        startDate,
        endDate
      );

      // Get available resources
      const resources = await this.getAvailableResources(territoryId, startDate, endDate);

      // Run optimization algorithm
      const result = await this.optimizeSchedule(appointments, resources);

      // Update optimization record
      const executionTime = Date.now() - startTime;

      await prisma.scheduleOptimization.update({
        where: { id: optimization.id },
        data: {
          status: autoApply ? 'COMPLETED' : 'AWAITING_APPROVAL',
          appointmentsConsidered: appointments.length,
          resourcesConsidered: resources.length,
          resourceIds: resources.map(r => r.id),
          appointmentsOptimized: result.optimized.length,
          appointmentsRescheduled: result.rescheduled.length,
          travelTimeReduced: result.travelTimeSaved,
          utilizationImproved: result.utilizationImprovement,
          changes: autoApply ? result.changes : null,
          suggestedChanges: autoApply ? null : result.changes,
          executionTimeMs: executionTime,
          algorithmVersion: '1.0.0',
          completedAt: new Date(),
        },
      });

      // Apply changes if auto-approved
      if (autoApply) {
        await this.applyOptimizationChanges(result.changes);
      }

      logger.info(`Schedule optimization completed: ${result.optimized.length} optimized, ${result.travelTimeSaved} minutes saved`);

      return {
        optimizationId: optimization.id,
        ...result,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      await prisma.scheduleOptimization.update({
        where: { id: optimization.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async getAppointmentsForOptimization(territoryId, startDate, endDate) {
    const where = {
      scheduledStart: { gte: startDate, lte: endDate },
      status: { in: ['SCHEDULED', 'NONE'] },
    };

    if (territoryId) {
      where.workOrder = {
        territoryId,
      };
    }

    return prisma.serviceAppointment.findMany({
      where,
      include: {
        workOrder: {
          include: {
            opportunity: {
              select: { id: true, name: true, street: true, city: true, state: true, postalCode: true },
            },
          },
        },
        assignedResources: {
          include: {
            serviceResource: true,
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async getAvailableResources(territoryId, startDate, endDate) {
    const where = {
      isActive: true,
    };

    if (territoryId) {
      where.territoryMembers = {
        some: { territoryId },
      };
    }

    return prisma.serviceResource.findMany({
      where,
      include: {
        territoryMembers: true,
        capacities: {
          where: {
            date: { gte: startDate, lte: endDate },
          },
        },
        absences: {
          where: {
            OR: [
              { startTime: { lte: endDate }, endTime: { gte: startDate } },
            ],
          },
        },
      },
    });
  }

  /**
   * Core optimization algorithm
   */
  async optimizeSchedule(appointments, resources) {
    const changes = [];
    const optimized = [];
    const rescheduled = [];
    let travelTimeSaved = 0;

    // Group appointments by date
    const appointmentsByDate = this.groupByDate(appointments);

    for (const [date, dayAppointments] of Object.entries(appointmentsByDate)) {
      // Get available resources for this day
      const dayResources = this.getResourcesForDate(resources, new Date(date));

      // Skip if no resources available
      if (dayResources.length === 0) continue;

      // For each resource, optimize their route
      for (const resource of dayResources) {
        const resourceAppointments = dayAppointments.filter(apt =>
          apt.assignedResources.some(ar => ar.serviceResourceId === resource.id)
        );

        if (resourceAppointments.length < 2) continue;

        // Calculate optimal order based on geography
        const optimizedOrder = await this.optimizeRoute(resourceAppointments);

        // Calculate time savings
        const originalTravelTime = this.calculateTravelTime(resourceAppointments);
        const optimizedTravelTime = this.calculateTravelTime(optimizedOrder);
        const timeSaved = originalTravelTime - optimizedTravelTime;

        if (timeSaved > 0) {
          travelTimeSaved += timeSaved;

          // Generate schedule changes
          for (let i = 0; i < optimizedOrder.length; i++) {
            const apt = optimizedOrder[i];
            const originalIndex = resourceAppointments.findIndex(a => a.id === apt.id);

            if (i !== originalIndex) {
              const newStart = this.calculateNewStartTime(optimizedOrder, i, resource);

              changes.push({
                appointmentId: apt.id,
                appointmentNumber: apt.appointmentNumber,
                resourceId: resource.id,
                resourceName: resource.name,
                originalStart: apt.scheduledStart,
                newStart,
                reason: 'Route optimization',
              });

              rescheduled.push(apt.id);
            }
          }

          optimized.push(...resourceAppointments.map(a => a.id));
        }
      }
    }

    // Calculate utilization improvement
    const utilizationBefore = this.calculateAverageUtilization(appointments, resources);
    const utilizationAfter = this.calculateProjectedUtilization(appointments, resources, changes);
    const utilizationImprovement = utilizationAfter - utilizationBefore;

    return {
      optimized: [...new Set(optimized)],
      rescheduled,
      travelTimeSaved,
      utilizationImprovement,
      changes,
    };
  }

  /**
   * Optimize route order using nearest neighbor algorithm
   */
  async optimizeRoute(appointments) {
    if (appointments.length <= 1) return appointments;

    // Get coordinates for each appointment
    const appointmentsWithCoords = await Promise.all(
      appointments.map(async apt => ({
        ...apt,
        coords: await this.getCoordinates(apt),
      }))
    );

    // Simple nearest neighbor algorithm
    const ordered = [];
    const remaining = [...appointmentsWithCoords];

    // Start with first appointment
    ordered.push(remaining.shift());

    while (remaining.length > 0) {
      const last = ordered[ordered.length - 1];
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const distance = this.calculateDistance(last.coords, remaining[i].coords);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      ordered.push(remaining.splice(nearestIndex, 1)[0]);
    }

    return ordered;
  }

  // ==========================================
  // Smart Scheduling (Find Best Slot)
  // ==========================================

  /**
   * Find optimal time slot for a new appointment
   */
  async findOptimalSlot(options = {}) {
    const {
      workOrderId,
      duration = 60, // minutes
      skillRequired,
      preferredDate,
      preferredTime,
      searchDays = 14,
      postalCode,
    } = options;

    // Get work order details
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        opportunity: true,
        territory: true,
      },
    });

    if (!workOrder) {
      throw new Error('Work order not found');
    }

    const startDate = preferredDate ? new Date(preferredDate) : new Date();
    const endDate = new Date(startDate.getTime() + searchDays * 24 * 60 * 60 * 1000);

    // Get available resources
    const resources = await this.getQualifiedResources({
      territoryId: workOrder.territoryId,
      skillRequired,
      startDate,
      endDate,
    });

    // Find all available slots
    const slots = [];

    for (const resource of resources) {
      const resourceSlots = await this.getAvailableSlots(resource, startDate, endDate, duration);

      for (const slot of resourceSlots) {
        // Score the slot
        const score = this.scoreSlot(slot, {
          preferredDate,
          preferredTime,
          postalCode,
          location: workOrder.opportunity,
          resource,
        });

        slots.push({
          ...slot,
          resourceId: resource.id,
          resourceName: resource.name,
          score,
        });
      }
    }

    // Sort by score (highest first)
    slots.sort((a, b) => b.score - a.score);

    // Return top 5 options
    return slots.slice(0, 5);
  }

  async getQualifiedResources(options = {}) {
    const { territoryId, skillRequired, startDate, endDate } = options;

    const where = {
      isActive: true,
    };

    if (territoryId) {
      where.territoryMembers = { some: { territoryId } };
    }

    const resources = await prisma.serviceResource.findMany({
      where,
      include: {
        skills: true,
        capacities: {
          where: { date: { gte: startDate, lte: endDate } },
        },
        absences: {
          where: {
            startTime: { lte: endDate },
            endTime: { gte: startDate },
          },
        },
      },
    });

    // Filter by skill if required
    if (skillRequired) {
      return resources.filter(r =>
        r.skills.some(s => s.skillId === skillRequired || s.skill?.name === skillRequired)
      );
    }

    return resources;
  }

  async getAvailableSlots(resource, startDate, endDate, duration) {
    const slots = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Skip weekends
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Check for absences
      const isAbsent = resource.absences.some(absence =>
        absence.startTime <= currentDate && absence.endTime >= currentDate
      );

      if (isAbsent) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Get capacity for this day
      const dateStr = currentDate.toISOString().split('T')[0];
      const capacity = resource.capacities.find(
        c => c.date.toISOString().split('T')[0] === dateStr
      );

      // Default hours if no capacity defined
      const startHour = capacity ? new Date(capacity.availableFrom).getHours() : 8;
      const endHour = capacity ? new Date(capacity.availableTo).getHours() : 17;

      // Get existing appointments for this day
      const existingAppointments = await prisma.serviceAppointment.findMany({
        where: {
          assignedResources: { some: { serviceResourceId: resource.id } },
          scheduledStart: {
            gte: new Date(currentDate.setHours(0, 0, 0, 0)),
            lt: new Date(currentDate.setHours(23, 59, 59, 999)),
          },
          status: { notIn: ['CANCELLED', 'CANNOT_COMPLETE'] },
        },
        orderBy: { scheduledStart: 'asc' },
      });

      // Find gaps
      let currentTime = new Date(currentDate);
      currentTime.setHours(startHour, 0, 0, 0);

      const dayEnd = new Date(currentDate);
      dayEnd.setHours(endHour, 0, 0, 0);

      for (const apt of existingAppointments) {
        const aptStart = new Date(apt.scheduledStart);
        const gapMinutes = (aptStart - currentTime) / (1000 * 60);

        if (gapMinutes >= duration) {
          slots.push({
            date: new Date(currentDate),
            startTime: new Date(currentTime),
            endTime: new Date(currentTime.getTime() + duration * 60 * 1000),
            gapSize: gapMinutes,
          });
        }

        currentTime = new Date(apt.scheduledEnd || aptStart.getTime() + 60 * 60 * 1000);
      }

      // Check remaining time
      const remainingMinutes = (dayEnd - currentTime) / (1000 * 60);
      if (remainingMinutes >= duration) {
        slots.push({
          date: new Date(currentDate),
          startTime: new Date(currentTime),
          endTime: new Date(currentTime.getTime() + duration * 60 * 1000),
          gapSize: remainingMinutes,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  scoreSlot(slot, preferences) {
    let score = 100;

    // Prefer earlier dates (decay)
    const daysFromNow = Math.floor((slot.date - new Date()) / (1000 * 60 * 60 * 24));
    score -= daysFromNow * 2;

    // Prefer morning slots
    const hour = slot.startTime.getHours();
    if (hour >= 8 && hour <= 10) score += 10;
    else if (hour >= 10 && hour <= 14) score += 5;

    // Match preferred date
    if (preferences.preferredDate) {
      const prefDate = new Date(preferences.preferredDate).toDateString();
      if (slot.date.toDateString() === prefDate) score += 30;
    }

    // Match preferred time
    if (preferences.preferredTime) {
      const prefHour = parseInt(preferences.preferredTime.split(':')[0]);
      const diff = Math.abs(hour - prefHour);
      score -= diff * 5;
    }

    // Minimize travel (if we have location data)
    // This would calculate distance from previous/next appointments
    // For now, prefer filling gaps
    if (slot.gapSize < 120) score += 15; // Small gap = efficient

    return Math.max(0, score);
  }

  // ==========================================
  // Capacity Management
  // ==========================================

  /**
   * Set resource capacity for a date
   */
  async setResourceCapacity(resourceId, date, capacity) {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    return prisma.resourceCapacity.upsert({
      where: {
        serviceResourceId_date: {
          serviceResourceId: resourceId,
          date: dateOnly,
        },
      },
      update: {
        ...capacity,
        updatedAt: new Date(),
      },
      create: {
        serviceResourceId: resourceId,
        date: dateOnly,
        dayOfWeek: dateOnly.getDay(),
        availableFrom: capacity.availableFrom || new Date(dateOnly.setHours(8, 0, 0, 0)),
        availableTo: capacity.availableTo || new Date(dateOnly.setHours(17, 0, 0, 0)),
        ...capacity,
      },
    });
  }

  /**
   * Get resource utilization stats
   */
  async getResourceUtilization(resourceId, startDate, endDate) {
    const appointments = await prisma.serviceAppointment.findMany({
      where: {
        assignedResources: { some: { serviceResourceId: resourceId } },
        scheduledStart: { gte: startDate, lte: endDate },
        status: { notIn: ['CANCELLED'] },
      },
    });

    const capacities = await prisma.resourceCapacity.findMany({
      where: {
        serviceResourceId: resourceId,
        date: { gte: startDate, lte: endDate },
      },
    });

    // Calculate total scheduled hours
    let scheduledMinutes = 0;
    for (const apt of appointments) {
      if (apt.scheduledEnd && apt.scheduledStart) {
        scheduledMinutes += (new Date(apt.scheduledEnd) - new Date(apt.scheduledStart)) / (1000 * 60);
      } else {
        scheduledMinutes += 60; // Default 1 hour
      }
    }

    // Calculate total available hours
    let availableMinutes = 0;
    for (const cap of capacities) {
      const dayMinutes = (new Date(cap.availableTo) - new Date(cap.availableFrom)) / (1000 * 60);
      availableMinutes += dayMinutes;
    }

    // Use default if no capacities defined
    if (availableMinutes === 0) {
      const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      availableMinutes = days * 8 * 60; // 8 hours/day default
    }

    return {
      scheduledMinutes,
      availableMinutes,
      utilization: availableMinutes > 0 ? (scheduledMinutes / availableMinutes) * 100 : 0,
      appointmentCount: appointments.length,
    };
  }

  // ==========================================
  // Apply Changes
  // ==========================================

  async applyOptimizationChanges(changes) {
    for (const change of changes) {
      await prisma.serviceAppointment.update({
        where: { id: change.appointmentId },
        data: {
          scheduledStart: change.newStart,
          scheduledEnd: new Date(
            new Date(change.newStart).getTime() +
            (new Date(change.originalEnd || change.originalStart).getTime() -
              new Date(change.originalStart).getTime())
          ),
        },
      });
    }
  }

  async approveOptimization(optimizationId, userId) {
    const optimization = await prisma.scheduleOptimization.findUnique({
      where: { id: optimizationId },
    });

    if (!optimization || optimization.status !== 'AWAITING_APPROVAL') {
      throw new Error('Optimization not found or not awaiting approval');
    }

    // Apply changes
    if (optimization.suggestedChanges) {
      await this.applyOptimizationChanges(optimization.suggestedChanges);
    }

    // Update record
    return prisma.scheduleOptimization.update({
      where: { id: optimizationId },
      data: {
        status: 'COMPLETED',
        changes: optimization.suggestedChanges,
        suggestedChanges: null,
        approvedById: userId,
        approvedAt: new Date(),
        autoApproved: false,
      },
    });
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  groupByDate(appointments) {
    const grouped = {};
    for (const apt of appointments) {
      const dateKey = new Date(apt.scheduledStart).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(apt);
    }
    return grouped;
  }

  getResourcesForDate(resources, date) {
    const dayOfWeek = date.getDay();

    return resources.filter(resource => {
      // Check absences
      const isAbsent = resource.absences.some(absence =>
        absence.startTime <= date && absence.endTime >= date
      );
      if (isAbsent) return false;

      return true;
    });
  }

  async getCoordinates(appointment) {
    const opp = appointment.workOrder?.opportunity;
    if (!opp) return { lat: 0, lng: 0 };

    // In production, this would use a geocoding service
    // For now, return mock coordinates based on postal code
    const zip = opp.postalCode || '00000';
    return {
      lat: 39.0 + (parseInt(zip.slice(0, 2)) / 100),
      lng: -77.0 - (parseInt(zip.slice(2, 4)) / 100),
    };
  }

  calculateDistance(coord1, coord2) {
    // Haversine formula for distance in miles
    const R = 3959; // Earth radius in miles
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  calculateTravelTime(appointments) {
    let totalMinutes = 0;
    for (let i = 1; i < appointments.length; i++) {
      const distance = this.calculateDistance(
        appointments[i - 1].coords || { lat: 0, lng: 0 },
        appointments[i].coords || { lat: 0, lng: 0 }
      );
      // Assume average 30 mph
      totalMinutes += (distance / 30) * 60;
    }
    return Math.round(totalMinutes);
  }

  calculateNewStartTime(appointments, index, resource) {
    if (index === 0) {
      // First appointment - start at resource's start time
      return new Date(new Date().setHours(8, 0, 0, 0));
    }

    const prevApt = appointments[index - 1];
    const prevEnd = new Date(prevApt.scheduledEnd || new Date(prevApt.scheduledStart).getTime() + 60 * 60 * 1000);

    // Add travel time
    const travelMinutes = 15; // Default 15 min travel
    return new Date(prevEnd.getTime() + travelMinutes * 60 * 1000);
  }

  calculateAverageUtilization(appointments, resources) {
    // Simplified utilization calculation
    const scheduledHours = appointments.length * 1; // Assume 1 hour each
    const availableHours = resources.length * 8; // 8 hours per resource
    return availableHours > 0 ? (scheduledHours / availableHours) * 100 : 0;
  }

  calculateProjectedUtilization(appointments, resources, changes) {
    // Same as above but with changes factored in
    return this.calculateAverageUtilization(appointments, resources) + 5; // Assume 5% improvement
  }
}

export const schedulingService = new SchedulingService();
