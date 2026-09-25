#!/bin/bash
set -euo pipefail

export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

ENDPOINT="--endpoint-url=http://localhost:4566"
ACCOUNT_ID=000000000000

# Allow an SNS topic to deliver to an SQS queue, then subscribe the queue to it.
# Usage: subscribe_queue_to_topic <topic_arn> <queue_url> <queue_arn>
subscribe_queue_to_topic() {
  local topic_arn="$1"
  local queue_url="$2"
  local queue_arn="$3"

  aws $ENDPOINT sqs set-queue-attributes \
    --queue-url "$queue_url" \
    --attributes "{\"Policy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"sns.amazonaws.com\\\"},\\\"Action\\\":\\\"sqs:SendMessage\\\",\\\"Resource\\\":\\\"${queue_arn}\\\",\\\"Condition\\\":{\\\"ArnEquals\\\":{\\\"aws:SourceArn\\\":\\\"${topic_arn}\\\"}}}]}\"}"

  aws $ENDPOINT sns subscribe \
    --topic-arn "$topic_arn" \
    --protocol sqs \
    --notification-endpoint "$queue_arn"

  echo "Subscribed $queue_arn to $topic_arn"
}

TOPIC_NAME=gfr__sns___config_update
UPDATES_QUEUE_NAME=grants_ui_backend__sqs__config_updates
INPUT_QUEUE_NAME=gfr__sqs___config_input

# Config broker S3 bucket
aws $ENDPOINT s3 mb s3://configs-bucket || true
echo "Created S3 bucket"

# Config broker input queue (polled by grants-config-broker)
aws $ENDPOINT sqs create-queue --queue-name "$INPUT_QUEUE_NAME"
echo "Created/located SQS queue: $INPUT_QUEUE_NAME"

# SNS topic published to by grants-config-broker on form-definition changes
TOPIC_ARN=$(aws $ENDPOINT sns create-topic --name "$TOPIC_NAME" --query TopicArn --output text)
echo "Created/located SNS topic: $TOPIC_ARN"

# SQS queue consumed by grants-ui-backend to ingest those changes
QUEUE_URL=$(aws $ENDPOINT sqs create-queue --queue-name "$UPDATES_QUEUE_NAME" --query QueueUrl --output text)
QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${UPDATES_QUEUE_NAME}"
echo "Created/located SQS queue: $QUEUE_URL ($QUEUE_ARN)"

subscribe_queue_to_topic "$TOPIC_ARN" "$QUEUE_URL" "$QUEUE_ARN"

# Feature controls: FIFO topic published to by grants-config-broker on value changes,
# and the FIFO queue consumed by grants-ui-backend (FIFO topics only deliver to FIFO queues)
FC_TOPIC_NAME=gfr__sns__feature_control.fifo
FC_QUEUE_NAME=grants_ui_backend__sqs__feature_control.fifo

FC_TOPIC_ARN=$(aws $ENDPOINT sns create-topic --name "$FC_TOPIC_NAME" \
  --attributes FifoTopic=true,ContentBasedDeduplication=false \
  --query TopicArn --output text)
echo "Created/located SNS topic: $FC_TOPIC_ARN"

FC_QUEUE_URL=$(aws $ENDPOINT sqs create-queue --queue-name "$FC_QUEUE_NAME" \
  --attributes FifoQueue=true \
  --query QueueUrl --output text)
FC_QUEUE_ARN="arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${FC_QUEUE_NAME}"
echo "Created/located SQS queue: $FC_QUEUE_URL ($FC_QUEUE_ARN)"

subscribe_queue_to_topic "$FC_TOPIC_ARN" "$FC_QUEUE_URL" "$FC_QUEUE_ARN"

echo READY > /tmp/READY