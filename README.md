# Panda CRM

Custom CRM platform for Panda Exteriors, built on AWS microservices architecture.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                     (S3 + CloudFront - React/Vue)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                        │
│                    (api.pandacrm.com)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────┬───────────┴───────────┬───────────────┐
        ▼               ▼                       ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Accounts    │ │   Contacts    │ │    Leads      │ │ Opportunities │
│   Service     │ │   Service     │ │   Service     │ │   Service     │
│  (ECS/Fargate)│ │  (ECS/Fargate)│ │  (ECS/Fargate)│ │  (ECS/Fargate)│
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │                 │
        └─────────────────┴────────┬────────┴─────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │     RDS PostgreSQL          │
                    │   (panda-crm database)      │
                    └─────────────────────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| accounts-service | 3001 | Account/Company management |
| contacts-service | 3002 | Contact management |
| leads-service | 3003 | Lead management & conversion |
| opportunities-service | 3004 | Opportunity/Project management |
| auth-service | 3005 | Authentication (Cognito integration) |
| scheduling-service | 3006 | Field Service scheduling |
| quotes-service | 3007 | Quote generation |
| orders-service | 3008 | Order management |
| invoices-service | 3009 | Invoice & payments |
| commissions-service | 3010 | Commission calculations |

## Tech Stack

- **Runtime**: Node.js 20 (ES Modules)
- **Framework**: Express.js
- **Database**: PostgreSQL 15 (RDS)
- **ORM**: Prisma
- **Authentication**: Amazon Cognito
- **Container**: Docker + ECS Fargate
- **API Gateway**: AWS API Gateway
- **Message Queue**: Amazon SQS
- **Events**: Amazon EventBridge

## Directory Structure

```
panda-crm/
├── services/                 # Microservices
│   ├── accounts/
│   ├── contacts/
│   ├── leads/
│   ├── opportunities/
│   ├── auth/
│   ├── scheduling/
│   ├── quotes/
│   ├── orders/
│   ├── invoices/
│   └── commissions/
├── shared/                   # Shared libraries
│   ├── prisma/              # Database schema
│   ├── middleware/          # Common middleware
│   └── utils/               # Utility functions
├── infrastructure/          # Terraform/CloudFormation
├── frontend/                # React/Vue application
└── migrations/              # Salesforce migration scripts
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker
- AWS CLI configured
- PostgreSQL client

### Local Development

```bash
# Install dependencies
cd shared && npm install
cd ../services/accounts && npm install

# Start PostgreSQL locally
docker-compose up -d postgres

# Run migrations
cd shared/prisma && npx prisma migrate dev

# Start a service
cd services/accounts && npm run dev
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/panda_crm
COGNITO_USER_POOL_ID=us-east-2_xxxxx
COGNITO_CLIENT_ID=xxxxx
AWS_REGION=us-east-2
```
