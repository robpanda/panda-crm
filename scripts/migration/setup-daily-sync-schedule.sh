#!/bin/bash
#
# Setup Daily Sync Schedule using AWS EventBridge + ECS Fargate Task
#
# This runs the comprehensive-daily-sync.js script as a scheduled ECS task
# instead of Lambda (which has package size limits).
#

set -e

REGION="us-east-2"
CLUSTER_NAME="panda-crm-cluster"
TASK_FAMILY="panda-crm-daily-sync"
SCHEDULE_EXPRESSION="cron(0 6 * * ? *)"  # 1 AM EST = 6 AM UTC
RULE_NAME="panda-crm-daily-sync-schedule"
ROLE_ARN="arn:aws:iam::679128292059:role/panda-crm-ecs-events-role"
EXECUTION_ROLE_ARN="arn:aws:iam::679128292059:role/panda-crm-ecs-task-execution-role"
TASK_ROLE_ARN="arn:aws:iam::679128292059:role/panda-crm-ecs-task-role"

echo "=== Setting up Daily Sync Schedule ==="

# First, let's check if the ECS events role exists
echo "Checking IAM role..."
if ! aws iam get-role --role-name panda-crm-ecs-events-role --region $REGION 2>/dev/null; then
    echo "Creating ECS Events role..."
    aws iam create-role \
        --role-name panda-crm-ecs-events-role \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "events.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }' \
        --region $REGION

    aws iam attach-role-policy \
        --role-name panda-crm-ecs-events-role \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceEventsRole \
        --region $REGION

    echo "Waiting for role to propagate..."
    sleep 10
fi

# Register the task definition
echo "Registering ECS task definition..."
cat > /tmp/daily-sync-task-def.json << 'EOF'
{
    "family": "panda-crm-daily-sync",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "1024",
    "memory": "2048",
    "executionRoleArn": "arn:aws:iam::679128292059:role/panda-crm-ecs-task-execution-role",
    "taskRoleArn": "arn:aws:iam::679128292059:role/panda-crm-ecs-task-role",
    "containerDefinitions": [{
        "name": "daily-sync",
        "image": "679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/migration:latest",
        "essential": true,
        "command": ["node", "/app/scripts/migration/comprehensive-daily-sync.js"],
        "environment": [
            {"name": "DATABASE_URL", "value": "postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm"}
        ],
        "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
                "awslogs-group": "/ecs/panda-crm-daily-sync",
                "awslogs-region": "us-east-2",
                "awslogs-stream-prefix": "daily-sync"
            }
        }
    }]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/daily-sync-task-def.json --region $REGION

# Create CloudWatch Log Group if it doesn't exist
aws logs create-log-group --log-group-name /ecs/panda-crm-daily-sync --region $REGION 2>/dev/null || true

# Create the EventBridge rule
echo "Creating EventBridge rule..."
aws events put-rule \
    --name $RULE_NAME \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --state ENABLED \
    --description "Daily Salesforce sync to Panda CRM at 1 AM EST" \
    --region $REGION

# Get the subnet and security group from existing services
echo "Getting network configuration..."
SUBNET_ID=$(aws ecs describe-services --cluster $CLUSTER_NAME --services auth-service --region $REGION --query 'services[0].networkConfiguration.awsvpcConfiguration.subnets[0]' --output text)
SECURITY_GROUP=$(aws ecs describe-services --cluster $CLUSTER_NAME --services auth-service --region $REGION --query 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups[0]' --output text)

echo "  Subnet: $SUBNET_ID"
echo "  Security Group: $SECURITY_GROUP"

# Add ECS task as target
echo "Adding ECS task target..."
aws events put-targets \
    --rule $RULE_NAME \
    --targets "[{
        \"Id\": \"1\",
        \"Arn\": \"arn:aws:ecs:$REGION:679128292059:cluster/$CLUSTER_NAME\",
        \"RoleArn\": \"$ROLE_ARN\",
        \"EcsParameters\": {
            \"TaskDefinitionArn\": \"arn:aws:ecs:$REGION:679128292059:task-definition/$TASK_FAMILY\",
            \"TaskCount\": 1,
            \"LaunchType\": \"FARGATE\",
            \"NetworkConfiguration\": {
                \"awsvpcConfiguration\": {
                    \"Subnets\": [\"$SUBNET_ID\"],
                    \"SecurityGroups\": [\"$SECURITY_GROUP\"],
                    \"AssignPublicIp\": \"ENABLED\"
                }
            },
            \"PlatformVersion\": \"LATEST\"
        }
    }]" \
    --region $REGION

echo ""
echo "=== Schedule Setup Complete ==="
echo "Rule: $RULE_NAME"
echo "Schedule: Daily at 1 AM EST (6 AM UTC)"
echo ""
echo "To test manually (run the sync now):"
echo "  aws ecs run-task --cluster $CLUSTER_NAME --task-definition $TASK_FAMILY --launch-type FARGATE --network-configuration \"awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}\" --region $REGION"
echo ""
echo "To view logs:"
echo "  aws logs tail /ecs/panda-crm-daily-sync --follow --region $REGION"
