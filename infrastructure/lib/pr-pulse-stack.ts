/**
 * PR-Pulse AWS CDK Stack
 * Defines Lambda functions, API Gateway HTTP API, and EventBridge CRON rules
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface PrPulseStackProps extends cdk.StackProps {
  environment: string;
}

export class PrPulseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PrPulseStackProps) {
    super(scope, id, props);

    // Environment
    const envName = props.environment.toUpperCase();
    const stackName = `PRPulse-${envName}`;

    // DynamoDB Table for PR Cache
    const prCacheTable = new dynamodb.Table(this, 'PRPulseCache', {
      tableName: `PRPulse-Cache-${envName}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda Execution Role
    const lambdaRole = new iam.Role(this, 'PRPulseLambdaRole', {
      roleName: `PRPulseLambdaRole-${envName}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // DynamoDB permissions
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [prCacheTable.tableArn],
      })
    );

    // PR Evaluator Lambda Function
    const evaluatorLambda = new lambda.Function(this, 'PRPulseEvaluator', {
      functionName: `PRPulse-Evaluator-${envName}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/handlers/evaluate.handler',
      code: lambda.Code.fromAsset('dist'),
      role: lambdaRole,
      environment: {
        NODE_ENV: envName,
        DATABASE_TABLE_NAME: prCacheTable.tableName,
        AWS_REGION: cdk.Aws.REGION,
      },
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
    });

    // PR Digest Lambda Function
    const digestLambda = new lambda.Function(this, 'PRPulseDigest', {
      functionName: `PRPulse-Digest-${envName}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'src/handlers/digest.handler',
      code: lambda.Code.fromAsset('dist'),
      role: lambdaRole,
      environment: {
        NODE_ENV: envName,
        DATABASE_TABLE_NAME: prCacheTable.tableName,
        AWS_REGION: cdk.Aws.REGION,
      },
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
    });

    // API Gateway HTTP API
    const httpApi = new apigateway.HttpApi(this, 'PRPulseApi', {
      apiName: `PRPulse-API-${envName}`,
      description: 'PR-Pulse evaluation API',
      createDefaultStage: true,
    });

    // Lambda Integration for /evaluate endpoint
    const lambdaIntegration = new apigatewayIntegrations.HttpLambdaIntegration(
      'EvaluateIntegration',
      evaluatorLambda
    );

    // Add /evaluate route
    httpApi.addRoutes({
      path: '/evaluate',
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    // EventBridge Rule for daily digest (9 AM UTC)
    const digestRule = new events.Rule(this, 'DailyDigestRule', {
      ruleName: `PRPulse-DailyDigest-${envName}`,
      schedule: events.Schedule.cron({ minute: '0', hour: '9' }),
      description: 'Daily digest generation at 9 AM UTC',
    });

    // EventBridge Target
    digestRule.addTarget(new eventsTargets.LambdaFunction(digestLambda));

    // Output: API Endpoint URL
    new cdk.CfnOutput(this, 'ApiEndpointUrl', {
      description: 'API Gateway endpoint URL',
      value: httpApi.apiEndpoint,
    });

    // Output: DynamoDB Table Name
    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      description: 'DynamoDB table name for PR cache',
      value: prCacheTable.tableName,
    });
  }
}
