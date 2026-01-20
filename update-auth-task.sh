#!/bin/bash
# Update auth service task definition with S3 environment variable

# Get the current task definition
TASK_DEF=$(aws ecs describe-task-definition --task-definition panda-crm-auth:20 --region us-east-2)

# Extract the container definition and add S3_BUCKET_NAME
NEW_TASK_DEF=$(echo "$TASK_DEF" | jq '
  .taskDefinition |
  {
    family: .family,
    networkMode: .networkMode,
    taskRoleArn: .taskRoleArn,
    executionRoleArn: .executionRoleArn,
    requiresCompatibilities: .requiresCompatibilities,
    cpu: .cpu,
    memory: .memory,
    containerDefinitions: [
      .containerDefinitions[0] |
      .environment += [{"name": "S3_BUCKET_NAME", "value": "panda-crm-support"}]
    ]
  }
')

# Register new task definition
echo "Registering new task definition..."
aws ecs register-task-definition \
  --region us-east-2 \
  --cli-input-json "$NEW_TASK_DEF"

echo ""
echo "✅ New task definition registered!"
echo "Now updating the service..."

# Get the new task definition revision
NEW_REVISION=$(aws ecs describe-task-definition --task-definition panda-crm-auth --region us-east-2 --query 'taskDefinition.revision' --output text)

# Update the service
aws ecs update-service \
  --cluster panda-crm-cluster \
  --service panda-crm-auth \
  --task-definition panda-crm-auth:$NEW_REVISION \
  --force-new-deployment \
  --region us-east-2

echo ""
echo "✅ Service updated to use task definition revision $NEW_REVISION"
echo "The new task will start with S3_BUCKET_NAME environment variable"
