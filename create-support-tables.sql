-- Simple SQL script to create support ticket tables
-- Run this directly in your database

-- Step 1: Create enums
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportTicketStatus') THEN
        CREATE TYPE "SupportTicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_FOR_USER', 'ON_HOLD', 'RESOLVED', 'CLOSED');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportTicketPriority') THEN
        CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
    END IF;
END$$;

-- Step 2: Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ticket_number TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status "SupportTicketStatus" DEFAULT 'NEW' NOT NULL,
    priority "SupportTicketPriority" DEFAULT 'MEDIUM' NOT NULL,
    category TEXT,
    page_url TEXT,
    screenshot_url TEXT,
    browser_info TEXT,
    user_id TEXT NOT NULL REFERENCES users(id),
    assigned_to_id TEXT REFERENCES users(id),
    resolved_at TIMESTAMP(3),
    resolved_by_id TEXT REFERENCES users(id),
    first_response_at TIMESTAMP(3),
    last_response_at TIMESTAMP(3),
    response_time_mins INTEGER,
    resolution_time_mins INTEGER,
    related_help_article_id TEXT REFERENCES help_articles(id),
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Step 3: Create support_ticket_messages table
CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false NOT NULL,
    is_resolution BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Step 4: Create support_ticket_attachments table
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    message_id TEXT,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT,
    uploaded_by_id TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_to_id_idx ON support_tickets(assigned_to_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_ticket_number_idx ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_id_idx ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS support_ticket_messages_created_at_idx ON support_ticket_messages(created_at);
CREATE INDEX IF NOT EXISTS support_ticket_attachments_ticket_id_idx ON support_ticket_attachments(ticket_id);

-- Success!
SELECT 'Support tables created successfully!' as result;
