/**
 * PR-Pulse AWS CDK Stack
 * Lambda (Node.js 24), API Gateway, EventBridge, and an S3 website.
 * Data lives in Supabase. This stack does not create DynamoDB.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

export interface PrPulseStackProps extends cdk.StackProps {
  environment: string;
}

export class PrPulseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PrPulseStackProps) {
    super(scope, id, props);

    const envName = props.environment.toUpperCase();

    const lambdaRole = new iam.Role(this, 'PRPulseLambdaRole', {
      roleName: `PRPulseLambdaRole-${envName}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    const sharedEnv = {
      NODE_ENV: envName,
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    };

    const bundling = { minify: true, sourceMap: false, externalModules: ['@aws-sdk/*'] };

    const evaluatorLambda = new lambdaNode.NodejsFunction(this, 'PRPulseEvaluator', {
      functionName: `PRPulse-Evaluator-${envName}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../src/handlers/evaluate.ts'),
      handler: 'handler',
      role: lambdaRole,
      environment: sharedEnv,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      bundling,
    });

    const syncLambda = new lambdaNode.NodejsFunction(this, 'PRPulseSync', {
      functionName: `PRPulse-Sync-${envName}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../src/handlers/sync.ts'),
      handler: 'handler',
      role: lambdaRole,
      environment: sharedEnv,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      bundling,
    });

    const digestLambda = new lambdaNode.NodejsFunction(this, 'PRPulseDigest', {
      functionName: `PRPulse-Digest-${envName}`,
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../src/handlers/digest.ts'),
      handler: 'handler',
      role: lambdaRole,
      environment: sharedEnv,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      bundling,
    });

    const httpApi = new apigateway.HttpApi(this, 'PRPulseApi', {
      apiName: `PRPulse-API-${envName}`,
      description: 'PR-Pulse evaluation and sync API',
      createDefaultStage: true,
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ['authorization', 'content-type'],
      },
    });

    httpApi.addRoutes({
      path: '/evaluate',
      methods: [apigateway.HttpMethod.POST],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('EvaluateIntegration', evaluatorLambda),
    });

    httpApi.addRoutes({
      path: '/sync',
      methods: [apigateway.HttpMethod.POST],
      integration: new apigatewayIntegrations.HttpLambdaIntegration('SyncIntegration', syncLambda),
    });

    const digestRule = new events.Rule(this, 'DailyDigestRule', {
      ruleName: `PRPulse-DailyDigest-${envName}`,
      schedule: events.Schedule.cron({ minute: '0', hour: '9' }),
      description: 'Daily digest at 9 AM UTC for users with an enabled connector',
    });
    digestRule.addTarget(new eventsTargets.LambdaFunction(digestLambda));

    const siteBucket = new s3.Bucket(this, 'DashboardBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new s3deploy.BucketDeployment(this, 'DashboardDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../web/dist'))],
      destinationBucket: siteBucket,
    });

    new cdk.CfnOutput(this, 'ApiEndpointUrl', {
      description: 'API Gateway endpoint URL. Set this as VITE_API_URL before building the dashboard.',
      value: httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      description: 'Public dashboard URL',
      value: siteBucket.bucketWebsiteUrl,
    });
  }
}
