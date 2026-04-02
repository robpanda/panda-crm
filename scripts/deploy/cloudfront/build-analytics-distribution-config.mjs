#!/usr/bin/env node
import fs from 'fs';

function main() {
  const [inputPath, outputPath, functionArn, pathPattern = '/analytics*'] = process.argv.slice(2);

  if (!inputPath || !outputPath || !functionArn) {
    throw new Error('Usage: build-analytics-distribution-config.mjs <input> <output> <function-arn> [path-pattern]');
  }

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const config = input.DistributionConfig || input;
  const defaultBehavior = config.DefaultCacheBehavior;
  const targetOriginId = defaultBehavior.TargetOriginId;

  const analyticsBehavior = {
    PathPattern: pathPattern,
    TargetOriginId: targetOriginId,
    TrustedSigners: { Enabled: false, Quantity: 0 },
    TrustedKeyGroups: { Enabled: false, Quantity: 0 },
    ViewerProtocolPolicy: defaultBehavior.ViewerProtocolPolicy,
    AllowedMethods: defaultBehavior.AllowedMethods,
    SmoothStreaming: false,
    Compress: true,
    LambdaFunctionAssociations: { Quantity: 0 },
    FunctionAssociations: {
      Quantity: 1,
      Items: [
        {
          FunctionARN: functionArn,
          EventType: 'viewer-request',
        },
      ],
    },
    FieldLevelEncryptionId: '',
    CachePolicyId: defaultBehavior.CachePolicyId,
    GrpcConfig: { Enabled: false },
  };

  const items = Array.isArray(config.CacheBehaviors?.Items) ? [...config.CacheBehaviors.Items] : [];
  const existingIndex = items.findIndex((item) => item.PathPattern === pathPattern);

  if (existingIndex >= 0) {
    items[existingIndex] = analyticsBehavior;
  } else {
    items.push(analyticsBehavior);
  }

  items.sort((left, right) => left.PathPattern.localeCompare(right.PathPattern));

  config.CacheBehaviors = {
    Quantity: items.length,
    Items: items,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
}

main();
