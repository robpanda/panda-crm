import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  syncAppointmentsToCalendar,
  disconnectCalendar,
  getBusyTimes,
} from '../integrations/googleCalendar.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// Get authorization URL to connect Google Calendar
router.get('/auth/:resourceId', async (req, res, next) => {
  try {
    const { resourceId } = req.params;

    // Verify resource exists
    const resource = await prisma.serviceResource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    const authUrl = getAuthUrl(resourceId);
    res.json({ authUrl });
  } catch (error) {
    next(error);
  }
});

// OAuth2 callback handler
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error: authError } = req.query;

    if (authError) {
      return res.status(400).json({ error: authError });
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing authorization code or state' });
    }

    const result = await handleCallback(code, state);

    // Redirect to success page or return JSON
    if (req.headers.accept?.includes('text/html')) {
      res.send(`
        <html>
          <head><title>Calendar Connected</title></head>
          <body>
            <h1>Google Calendar Connected Successfully!</h1>
            <p>You can close this window and return to the application.</p>
            <script>
              setTimeout(() => { window.close(); }, 3000);
            </script>
          </body>
        </html>
      `);
    } else {
      res.json(result);
    }
  } catch (error) {
    next(error);
  }
});

// Check connection status
router.get('/status/:resourceId', async (req, res, next) => {
  try {
    const { resourceId } = req.params;

    const resource = await prisma.serviceResource.findUnique({
      where: { id: resourceId },
      select: {
        id: true,
        name: true,
        googleCalendarConnected: true,
        googleTokenExpiry: true,
      },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    res.json({
      resourceId: resource.id,
      resourceName: resource.name,
      connected: resource.googleCalendarConnected || false,
      tokenExpiry: resource.googleTokenExpiry,
      tokenValid: resource.googleTokenExpiry ? resource.googleTokenExpiry > new Date() : false,
    });
  } catch (error) {
    next(error);
  }
});

// Disconnect Google Calendar
router.post('/disconnect/:resourceId', async (req, res, next) => {
  try {
    const { resourceId } = req.params;

    const resource = await prisma.serviceResource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    const result = await disconnectCalendar(resourceId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Sync appointments to Google Calendar
router.post('/sync/:resourceId', async (req, res, next) => {
  try {
    const { resourceId } = req.params;
    const { days = 14 } = req.body;

    const resource = await prisma.serviceResource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    if (!resource.googleCalendarConnected) {
      return res.status(400).json({ error: 'Google Calendar not connected' });
    }

    const result = await syncAppointmentsToCalendar(resourceId, days);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get busy times from Google Calendar
router.get('/busy/:resourceId', async (req, res, next) => {
  try {
    const { resourceId } = req.params;
    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const resource = await prisma.serviceResource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    if (!resource.googleCalendarConnected) {
      return res.json({ busyTimes: [], note: 'Google Calendar not connected' });
    }

    const busyTimes = await getBusyTimes(
      resourceId,
      new Date(startTime),
      new Date(endTime)
    );

    res.json({ busyTimes });
  } catch (error) {
    next(error);
  }
});

export default router;
