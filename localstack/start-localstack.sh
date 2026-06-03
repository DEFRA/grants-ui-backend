#!/bin/bash
set -euo pipefail

export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

ENDPOINT="--endpoint-url=http://localhost:4566"
ACCOUNT_ID=000000000000

TOPIC_NAME=gfr__sns___config_update
QUEUE_NAME=grants_ui_backend__sqs__config_updates

# Config broker S3 bucket
aws $ENDPOINT s3 mb s3://configs-bucket || true

# SNS topic published to by grants-config-broker on form-definition changes
TOPIC_ARN=$(aws $ENDPOINT sns create-topic --name "$TOPIC_NAME" --query TopicArn --output text)
echo "Created/located SNS topic: $TOPIC_ARN"

# SQS queue consumed by grants-ui-backend to ingest those changes
QUEUE_URL=$(aws $ENDPOINT sqs create-queue --queue-name "$QUEUE_NAME" --query QueueUrl --output text)
QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${QUEUE_NAME}"
echo "Created/located SQS queue: $QUEUE_URL ($QUEUE_ARN)"

# Allow the SNS topic to deliver to the SQS queue
aws $ENDPOINT sqs set-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attributes "{\"Policy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"sns.amazonaws.com\\\"},\\\"Action\\\":\\\"sqs:SendMessage\\\",\\\"Resource\\\":\\\"${QUEUE_ARN}\\\",\\\"Condition\\\":{\\\"ArnEquals\\\":{\\\"aws:SourceArn\\\":\\\"${TOPIC_ARN}\\\"}}}]}\"}"

# Subscribe the queue to the topic.
aws $ENDPOINT sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$QUEUE_ARN"

echo "Subscribed $QUEUE_ARN to $TOPIC_ARN"
