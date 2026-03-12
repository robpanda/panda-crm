import express from 'express';
import { logger } from '../middleware/logger.js';

const router = express.Router();

const PORTAL_PROXY_TIMEOUT_MS = Number(process.env.PORTAL_PROXY_TIMEOUT_MS || 10000);

function getPortalServiceBaseUrls() {
  const candidates = [
    process.env.OPPORTUNITIES_SERVICE_URL,
    process.env.OPPORTUNITIES_INTERNAL_URL,
    process.env.OPPORTUNITIES_URL,
    'http://opportunities-service:3004',
    'http://panda-crm-opportunities:3004',
    'http://opportunities:3004',
    'http://localhost:3004',
  ].filter(Boolean);

  return [...new Set(candidates.map((value) => String(value).replace(/\/+$/, '')))];
}

function buildProxyUrl(baseUrl, path, query = {}) {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') {
          url.searchParams.append(key, String(entry));
        }
      });
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function proxyPortalRequest(req, res, path) {
  const headers = { Accept: 'application/json' };
  const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const attempts = [];

  for (const baseUrl of getPortalServiceBaseUrls()) {
    const requestUrl = buildProxyUrl(baseUrl, path, req.query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PORTAL_PROXY_TIMEOUT_MS);

    try {
      const response = await fetch(requestUrl, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body || {}) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseText = await response.text();
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('content-type', contentType);
      }

      return res.status(response.status).send(responseText);
    } catch (error) {
      clearTimeout(timeout);
      attempts.push(`${requestUrl}: ${error.message}`);
    }
  }

  logger.error(`Portal proxy failed for ${req.method} ${req.originalUrl}: ${attempts.join(' | ')}`);
  return res.status(502).json({
    success: false,
    error: {
      code: 'BAD_GATEWAY',
      message: 'Customer portal is temporarily unavailable',
    },
  });
}

router.get('/job/:jobId', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/job/${encodeURIComponent(req.params.jobId)}`));

router.get('/:token/stages', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/stages`));

router.get('/:token/galleries', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/galleries`));

router.get('/:token/appointments', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/appointments`));

router.get('/:token/available-slots', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/available-slots`));

router.get('/:token/payment-link', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/payment-link`));

router.get('/:token/payments', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/payments`));

router.post('/:token/message', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/message`));

router.post('/:token/book', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}/book`));

router.post('/:token/appointments/:appointmentId/reschedule', (req, res) =>
  proxyPortalRequest(
    req,
    res,
    `/api/portal/${encodeURIComponent(req.params.token)}/appointments/${encodeURIComponent(req.params.appointmentId)}/reschedule`
  ));

router.post('/:token/appointments/:appointmentId/cancel', (req, res) =>
  proxyPortalRequest(
    req,
    res,
    `/api/portal/${encodeURIComponent(req.params.token)}/appointments/${encodeURIComponent(req.params.appointmentId)}/cancel`
  ));

router.get('/:token', (req, res) =>
  proxyPortalRequest(req, res, `/api/portal/${encodeURIComponent(req.params.token)}`));

export default router;
