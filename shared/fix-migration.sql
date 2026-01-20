-- Support Ticketing System Migration
-- Run this manually if Prisma migration fails

-- Create enums first (IF NOT EXISTS to avoid conflicts)
DO $$ BEGIN
    CREATE TYPE "SupportTicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_FOR_USER', 'ON_HOLD', 'RESOLVED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    ticket_number TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status "SupportTicketStatus" DEFAULT 'NEW' NOT NULL,
    priority "SupportTicketPriority" DEFAULT 'MEDIUM' NOT NULL,
    category TEXT,
    page_url TEXT,
    screenshot_url TEXT,
    browser_info TEXT,
    user_id TEXT NOT NULL,
    assigned_to_id TEXT,
    resolved_at TIMESTAMP(3),
    resolved_by_id TEXT,
    first_response_at TIMESTAMP(3),
    last_response_at TIMESTAMP(3),
    response_time_mins INTEGER,
    resolution_time_mins INTEGER,
    related_help_article_id TEXT,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT support_tickets_assigned_to_id_fkey FOREIGN KEY (assigned_to_id) REFERENCES users(id),
    CONSTRAINT support_tickets_resolved_by_id_fkey FOREIGN KEY (resolved_by_id) REFERENCES users(id),
    CONSTRAINT support_tickets_related_help_article_id_fkey FOREIGN KEY (related_help_article_id) REFERENCES help_articles(id)
);

-- Create support_ticket_messages table
CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false NOT NULL,
    is_resolution BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT support_ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT support_ticket_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create support_ticket_attachments table
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    message_id TEXT,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT,
    uploaded_by_id TEXT NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT support_ticket_attachments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT support_ticket_attachments_uploaded_by_id_fkey FOREIGN KEY (uploaded_by_id) REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_to_id_idx ON support_tickets(assigned_to_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_ticket_number_idx ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets(created_at);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_id_idx ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS support_ticket_messages_created_at_idx ON support_ticket_messages(created_at);

CREATE INDEX IF NOT EXISTS support_ticket_attachments_ticket_id_idx ON support_ticket_attachments(ticket_id);

-- Success message
SELECT 'Support ticketing tables created successfully!' AS status;
