#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PrPulseStack } from '../lib/pr-pulse-stack';

const app = new cdk.App();
const environment = app.node.tryGetContext('environment') || 'dev';

new PrPulseStack(app, `PRPulse-${String(environment).toUpperCase()}`, {
  environment: String(environment),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
