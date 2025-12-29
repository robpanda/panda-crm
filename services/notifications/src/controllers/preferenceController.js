import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default preferences for new users
const DEFAULT_PREFERENCES = {
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  quietHoursTimezone: 'America/New_York',
  typePreferences: {},
  digestEnabled: false,
  digestFrequency: null,
  digestTime: null,
};

// Get notification preferences for a user
export async function getPreferences(req, res, next) {
  try {
    const userId = req.params.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let preferences = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // If no preferences exist, return defaults
    if (!preferences) {
      preferences = {
        userId,
        ...DEFAULT_PREFERENCES,
      };
    }

    res.json(preferences);
  } catch (error) {
    next(error);
  }
}

// Update notification preferences
export async function updatePreferences(req, res, next) {
  try {
    const userId = req.params.userId || req.body.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const {
      emailEnabled,
      smsEnabled,
      pushEnabled,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
      quietHoursTimezone,
      typePreferences,
      digestEnabled,
      digestFrequency,
      digestTime,
    } = req.body;

    // Validate quiet hours format if provided
    if (quietHoursStart && !/^\d{2}:\d{2}$/.test(quietHoursStart)) {
      return res.status(400).json({
        error: 'quietHoursStart must be in HH:MM format',
      });
    }

    if (quietHoursEnd && !/^\d{2}:\d{2}$/.test(quietHoursEnd)) {
      return res.status(400).json({
        error: 'quietHoursEnd must be in HH:MM format',
      });
    }

    // Build update data, only including provided fields
    const updateData = {};
    if (emailEnabled !== undefined) updateData.emailEnabled = emailEnabled;
    if (smsEnabled !== undefined) updateData.smsEnabled = smsEnabled;
    if (pushEnabled !== undefined) updateData.pushEnabled = pushEnabled;
    if (quietHoursEnabled !== undefined) updateData.quietHoursEnabled = quietHoursEnabled;
    if (quietHoursStart !== undefined) updateData.quietHoursStart = quietHoursStart;
    if (quietHoursEnd !== undefined) updateData.quietHoursEnd = quietHoursEnd;
    if (quietHoursTimezone !== undefined) updateData.quietHoursTimezone = quietHoursTimezone;
    if (typePreferences !== undefined) updateData.typePreferences = typePreferences;
    if (digestEnabled !== undefined) updateData.digestEnabled = digestEnabled;
    if (digestFrequency !== undefined) updateData.digestFrequency = digestFrequency;
    if (digestTime !== undefined) updateData.digestTime = digestTime;

    // Upsert preferences
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_PREFERENCES,
        ...updateData,
      },
      update: updateData,
    });

    res.json(preferences);
  } catch (error) {
    next(error);
  }
}

// Reset preferences to defaults
export async function resetPreferences(req, res, next) {
  try {
    const userId = req.params.userId || req.body.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const preferences = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_PREFERENCES,
      },
      update: DEFAULT_PREFERENCES,
    });

    res.json(preferences);
  } catch (error) {
    next(error);
  }
}
