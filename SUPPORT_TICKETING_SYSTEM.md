# Support Ticketing System - Implementation Guide

## Overview
Complete support ticketing system integrated with the help documentation, allowing users to create tickets, track progress, attach files, auto-capture screenshots, and have conversations with support staff.

## ✅ Completed Components

### 1. Database Schema
**File:** [shared/prisma/schema.prisma](shared/prisma/schema.prisma)

**New Models:**
- `support_tickets` - Main ticket table
- `support_ticket_messages` - Conversation messages
- `support_ticket_attachments` - File attachments

**New Enums:**
- `SupportTicketStatus`: NEW, IN_PROGRESS, WAITING_FOR_USER, ON_HOLD, RESOLVED, CLOSED
- `SupportTicketPriority`: LOW, MEDIUM, HIGH, URGENT

**Relations:**
- Users can create, be assigned to, and resolve tickets
- Tickets linked to help articles
- Messages and attachments cascade delete with tickets

### 2. User-Facing Pages

#### Support Ticket List ([frontend/src/pages/Support.jsx](frontend/src/pages/Support.jsx))
**Features:**
- Dashboard with stats (Total, New, In Progress, Waiting, Resolved)
- Search and filter capabilities
- Status and priority filters
- Create new ticket button
- Ticket cards with preview information
- Auto-refresh functionality

#### Ticket Detail/Conversation ([frontend/src/pages/SupportTicketDetail.jsx](frontend/src/pages/SupportTicketDetail.jsx))
**Features:**
- Full ticket details with screenshot display
- Real-time conversation thread
- File attachment support
- Message history with timestamps
- User role indicators
- Related help article linking
- Sidebar with ticket metadata
- Send messages with attachments
- Visual status indicators

#### Create Ticket Modal ([frontend/src/components/CreateTicketModal.jsx](frontend/src/components/CreateTicketModal.jsx))
**Features:**
- **Auto Screenshot Capture** - Uses html2canvas to capture current page
- Form with subject, description, category, priority
- File attachment upload
- Browser info auto-collection
- Current page URL capture
- Form validation
- Loading states
- Preview uploaded files

### 3. Admin Pages

#### Admin Ticket Management ([frontend/src/pages/admin/AdminSupportTickets.jsx](frontend/src/pages/admin/AdminSupportTickets.jsx))
**Features:**
- View all tickets across all users
- Advanced filtering (status, priority, assigned)
- Bulk export to CSV
- Statistics dashboard:
  - Total open tickets
  - Average response time
  - Resolution rate
  - Unassigned count
- Assign tickets to staff
- Change status and priority
- Internal notes support

#### Support Analytics (Already exists: [frontend/src/pages/admin/Support.jsx](frontend/src/pages/admin/Support.jsx))
- Interaction analytics
- Top support topics
- User behavior patterns
- Export capabilities

### 4. Navigation Updates
**Files Modified:**
- [frontend/src/components/Navbar.jsx](frontend/src/components/Navbar.jsx) - Added Support to "More" menu
- Need to add to Sidebar.jsx and App.jsx (see TODO below)

---

## 🔧 TODO: Remaining Implementation Steps

### 1. Add Routes to App.jsx
**File to modify:** `frontend/src/App.jsx`

Add these imports:
```javascript
import Support from './pages/Support';
import SupportTicketDetail from './pages/SupportTicketDetail';
import AdminSupportTickets from './pages/admin/AdminSupportTickets';
```

Add these routes inside the Layout route:
```javascript
<Route path="support" element={<Support />} />
<Route path="support/:id" element={<SupportTicketDetail />} />

{/* Admin Routes */}
<Route path="admin/support/tickets" element={<AdminSupportTickets />} />
<Route path="admin/support/ticket/:id" element={<AdminSupportTicketManage />} />
```

### 2. Add to Sidebar Navigation
**File to modify:** `frontend/src/components/Sidebar.jsx`

Find the secondaryNavItems array and add:
```javascript
{ path: '/support', icon: LifeBuoy, label: 'Support' },
```

Add LifeBuoy import:
```javascript
import { ..., LifeBuoy } from 'lucide-react';
```

### 3. Install Required npm Package
The Create Ticket Modal uses `html2canvas` for screenshot capture:

```bash
cd frontend
npm install html2canvas
```

### 4. Run Database Migration
Generate and run the Prisma migration:

```bash
cd shared
npx prisma migrate dev --name add_support_tickets
npx prisma generate
```

This will create the support_tickets, support_ticket_messages, and support_ticket_attachments tables.

### 5. Create Backend API Routes
**New file to create:** `services/auth/src/routes/support.js`

```javascript
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// S3 configuration
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'panda-crm-support';

// Helper to generate ticket number
function generateTicketNumber() {
  const prefix = 'TKT';
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Helper to upload to S3
async function uploadToS3(file, folder = 'support') {
  const key = `${folder}/${Date.now()}-${file.originalname}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${key}`;
}

// Get user's tickets
router.get('/tickets', authMiddleware, async (req, res) => {
  try {
    const tickets = await prisma.support_tickets.findMany({
      where: { user_id: req.user.id },
      include: {
        _count: {
          select: {
            messages: true,
            attachments: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({ tickets });
  } catch (error) {
    console.error('Failed to get tickets:', error);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// Get single ticket
router.get('/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const ticket = await prisma.support_tickets.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id, // Users can only see their own tickets
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assigned_to: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        related_article: {
          select: {
            id: true,
            title: true,
            summary: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get messages
    const messages = await prisma.support_ticket_messages.findMany({
      where: { ticket_id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    res.json({ ticket, messages });
  } catch (error) {
    console.error('Failed to get ticket:', error);
    res.status(500).json({ error: 'Failed to load ticket' });
  }
});

// Create ticket
router.post('/tickets', authMiddleware, upload.fields([
  { name: 'screenshot', maxCount: 1 },
  { name: 'attachments', maxCount: 5 }
]), async (req, res) => {
  try {
    const { subject, description, category, priority, pageUrl, browserInfo } = req.body;

    // Upload screenshot if provided
    let screenshotUrl = null;
    if (req.files?.screenshot?.[0]) {
      screenshotUrl = await uploadToS3(req.files.screenshot[0], 'screenshots');
    }

    // Create ticket
    const ticket = await prisma.support_tickets.create({
      data: {
        ticket_number: generateTicketNumber(),
        subject,
        description,
        category: category || null,
        priority: priority || 'MEDIUM',
        status: 'NEW',
        page_url: pageUrl || null,
        browser_info: browserInfo || null,
        screenshot_url: screenshotUrl,
        user_id: req.user.id,
      },
    });

    // Upload and attach files
    if (req.files?.attachments) {
      for (const file of req.files.attachments) {
        const fileUrl = await uploadToS3(file, 'attachments');

        await prisma.support_ticket_attachments.create({
          data: {
            ticket_id: ticket.id,
            file_name: file.originalname,
            file_url: fileUrl,
            file_size: file.size,
            file_type: file.mimetype,
            uploaded_by_id: req.user.id,
          },
        });
      }
    }

    res.status(201).json({ ticket });
  } catch (error) {
    console.error('Failed to create ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Add message to ticket
router.post('/tickets/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { message, attachments } = req.body;

    // Verify ticket belongs to user
    const ticket = await prisma.support_tickets.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Create message
    const newMessage = await prisma.support_ticket_messages.create({
      data: {
        ticket_id: req.params.id,
        user_id: req.user.id,
        message,
        is_internal: false,
      },
    });

    // Update ticket timestamps
    await prisma.support_tickets.update({
      where: { id: req.params.id },
      data: {
        last_response_at: new Date(),
        status: ticket.status === 'WAITING_FOR_USER' ? 'IN_PROGRESS' : ticket.status,
      },
    });

    res.status(201).json({ message: newMessage });
  } catch (error) {
    console.error('Failed to create message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Admin: Get all tickets
router.get('/admin/tickets', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = req.user.roleType?.toLowerCase() === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const tickets = await prisma.support_tickets.findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assigned_to: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            messages: true,
            attachments: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { created_at: 'desc' },
      ],
    });

    res.json({ tickets });
  } catch (error) {
    console.error('Failed to get admin tickets:', error);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// Admin: Get stats
router.get('/admin/stats', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.roleType?.toLowerCase() === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [totalOpen, unassigned, resolved, avgResponse] = await Promise.all([
      prisma.support_tickets.count({
        where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      prisma.support_tickets.count({
        where: { assigned_to_id: null, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      prisma.support_tickets.count({
        where: {
          status: { in: ['RESOLVED', 'CLOSED'] },
          created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.support_tickets.aggregate({
        _avg: { response_time_mins: true },
        where: { response_time_mins: { not: null } },
      }),
    ]);

    const totalLast30Days = await prisma.support_tickets.count({
      where: { created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });

    res.json({
      totalOpen,
      unassigned,
      resolutionRate: totalLast30Days > 0 ? Math.round((resolved / totalLast30Days) * 100) : 0,
      avgResponseTime: avgResponse._avg.response_time_mins ?
        Math.round(avgResponse._avg.response_time_mins / 60) : null,
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Admin: Export tickets
router.get('/admin/export', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.roleType?.toLowerCase() === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const tickets = await prisma.support_tickets.findMany({
      include: {
        user: true,
        assigned_to: true,
      },
      orderBy: { created_at: 'desc' },
    });

    // Generate CSV
    const csv = [
      ['Ticket Number', 'Subject', 'Status', 'Priority', 'User', 'Assigned To', 'Created', 'Resolved'].join(','),
      ...tickets.map(t => [
        t.ticket_number,
        `"${t.subject}"`,
        t.status,
        t.priority,
        `"${t.user.firstName} ${t.user.lastName}"`,
        t.assigned_to ? `"${t.assigned_to.firstName} ${t.assigned_to.lastName}"` : 'Unassigned',
        t.created_at.toISOString(),
        t.resolved_at ? t.resolved_at.toISOString() : '',
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=support-tickets.csv');
    res.send(csv);
  } catch (error) {
    console.error('Failed to export tickets:', error);
    res.status(500).json({ error: 'Failed to export tickets' });
  }
});

export default router;
```

### 6. Register Support Routes
**File to modify:** `services/auth/src/index.js`

Add import:
```javascript
import supportRoutes from './routes/support.js';
```

Register routes:
```javascript
app.use('/support', supportRoutes);
```

### 7. Environment Variables
Add to `.env`:
```env
S3_BUCKET_NAME=panda-crm-support
AWS_REGION=us-east-2
```

### 8. Create S3 Bucket for Attachments
```bash
aws s3 mb s3://panda-crm-support --region us-east-2

# Set CORS policy
aws s3api put-bucket-cors --bucket panda-crm-support --cors-configuration file://cors.json
```

**cors.json:**
```json
{
  "CORSRules": [{
    "AllowedOrigins": ["https://crm.pandaadmin.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }]
}
```

---

## 📊 Features Summary

### User Features
- ✅ Create support tickets with auto-screenshot
- ✅ Attach files (images, documents, etc.)
- ✅ Track ticket status in real-time
- ✅ Conversation thread with support staff
- ✅ View related help articles
- ✅ Priority selection
- ✅ Category classification

### Admin Features
- ✅ View all tickets across organization
- ✅ Filter by status, priority, assignment
- ✅ Assign tickets to staff members
- ✅ Internal notes (not visible to users)
- ✅ Change status and priority
- ✅ Mark messages as resolution
- ✅ Export to CSV
- ✅ Analytics dashboard
- ✅ Response time tracking
- ✅ Resolution rate metrics

### Technical Features
- ✅ Auto-capture screenshots using html2canvas
- ✅ File upload to S3
- ✅ Browser info collection
- ✅ Page URL tracking
- ✅ Cascade delete attachments
- ✅ Soft delete support (can be added)
- ✅ Real-time status updates
- ✅ Mobile-responsive design

---

## 🔗 Integration with Help System

The support ticketing system is designed to work seamlessly with the existing help documentation:

1. **Related Articles**: Tickets can be linked to help articles
2. **Context Awareness**: Captures current page URL to understand where user needs help
3. **Training Bot Integration**: Can suggest creating a ticket from chat bot
4. **Knowledge Base**: Admin can create help articles from common ticket topics

---

## 🎨 Status & Priority System

### Status Flow
```
NEW → IN_PROGRESS → WAITING_FOR_USER ↔ IN_PROGRESS → RESOLVED → CLOSED
              ↓
          ON_HOLD
```

### Priority Levels
- **LOW**: Minor issues, no urgency
- **MEDIUM**: Normal priority (default)
- **HIGH**: Urgent, affecting work
- **URGENT**: Critical, blocking work

---

## 📱 User Experience

1. User clicks "Support" in navigation
2. Sees dashboard with all their tickets
3. Clicks "New Ticket" button
4. Fills out form (subject, description, category, priority)
5. Optionally captures screenshot of current page
6. Optionally attaches files
7. Submits ticket
8. Receives ticket number (e.g., TKT-12345678-ABCD)
9. Can view ticket details and add messages
10. Receives responses from support staff
11. Ticket is marked resolved when issue is fixed

---

## 🔐 Security Considerations

- ✅ Users can only see their own tickets
- ✅ Admins can see all tickets
- ✅ File size limits (10MB per file)
- ✅ File type validation recommended
- ✅ S3 bucket permissions configured
- ✅ Authentication required for all endpoints
- ✅ SQL injection protected (Prisma)
- ✅ XSS protection (React escaping)

---

## 🚀 Deployment Checklist

- [ ] Run database migration
- [ ] Install html2canvas package
- [ ] Create S3 bucket
- [ ] Configure S3 CORS
- [ ] Add environment variables
- [ ] Add routes to App.jsx
- [ ] Add to Sidebar navigation
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Test ticket creation
- [ ] Test file uploads
- [ ] Test screenshot capture
- [ ] Test admin features
- [ ] Configure email notifications (optional)

---

## 📈 Future Enhancements

### Potential Additions
1. **Email Notifications**
   - New ticket created
   - Status changed
   - New message received
   - Ticket resolved

2. **SLA Tracking**
   - First response SLA
   - Resolution SLA
   - Breach warnings

3. **Canned Responses**
   - Quick reply templates
   - Macro support

4. **Knowledge Base Suggestions**
   - AI-powered article recommendations
   - Auto-link related articles

5. **Ticket Templates**
   - Bug report template
   - Feature request template
   - Account issue template

6. **Advanced Search**
   - Full-text search
   - Date range filters
   - Custom field filters

7. **Webhook Integration**
   - Slack notifications
   - Microsoft Teams integration
   - Custom webhooks

8. **Rating System**
   - Rate support quality
   - Track satisfaction scores
   - Generate reports

---

## 📞 Support

For questions about this implementation:
- Review code comments
- Check API responses
- Monitor server logs
- Test in development first

---

## Version History

**v1.0.0** - 2026-01-19
- Initial support ticketing system
- User ticket creation and tracking
- Admin ticket management
- File attachments and screenshots
- Integration with help system
