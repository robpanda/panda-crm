-- Set Sutton and Greg Young as Call Center Managers
-- First, ensure the Call Center Manager role exists
INSERT INTO "roles" (id, name, description, role_type, is_active, created_at, updated_at, permissions)
SELECT
    'cmccmgrrole00001',
    'Call Center Manager',
    'Default Call Center Manager role',
    'call_center_manager',
    true,
    NOW(),
    NOW(),
    '{"accounts":["read","update"],"contacts":["create","read","update","export","assign"],"leads":["create","read","update","export","assign"],"opportunities":["read","update"],"appointments":["create","read","update","assign"],"templates":["read","update"],"campaigns":["create","read","update"],"users":["read"],"reports":["read","export"]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE name = 'Call Center Manager');

-- Update users named Sutton or Greg Young to be Call Center Managers
UPDATE "users"
SET role_id = (SELECT id FROM "roles" WHERE name = 'Call Center Manager' LIMIT 1),
    updated_at = NOW()
WHERE (
    LOWER(first_name) LIKE '%sutton%'
    OR LOWER(last_name) LIKE '%sutton%'
    OR (LOWER(first_name) = 'greg' AND LOWER(last_name) = 'young')
    OR (LOWER(first_name) LIKE '%greg%' AND LOWER(last_name) LIKE '%young%')
);
