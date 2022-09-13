import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {ISecurityGroup, IVpc, Port, SecurityGroup, Vpc} from "aws-cdk-lib/aws-ec2";
import {
  Cluster,
  ContainerImage,
  EcrImage,
  FargateService,
  FargateTaskDefinition,
  ICluster,
  LogDriver,
  Protocol
} from "aws-cdk-lib/aws-ecs";
import {ApplicationLoadBalancedFargateService} from "aws-cdk-lib/aws-ecs-patterns";
import {Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {RetentionDays} from "aws-cdk-lib/aws-logs";

export class AwsTraefikCdkDemoStack extends cdk.Stack {

  private readonly vpc: IVpc;
  private readonly cluster: ICluster;
  private readonly serviceSecurityGroup: ISecurityGroup;
  private readonly gatewayService: ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, 'Vpc', {});

    const gatewayCluster = new Cluster(this, 'GatewayCluster', {vpc: this.vpc, clusterName: 'traefik-demo-gateway'});
    this.cluster = new Cluster(this, 'Cluster', {vpc: this.vpc, clusterName: 'traefik-demo-service'});

    const gatewayImage = EcrImage.fromRegistry('traefik:v2.8');
    const gatewayTaskDefinition = new FargateTaskDefinition(this, 'GatewayTaskDefinition', {});
    gatewayTaskDefinition.addContainer('traefik', {
      image: gatewayImage,
      portMappings: [
        {containerPort: 80, protocol: Protocol.TCP},
        {containerPort: 8080, protocol: Protocol.TCP},
      ],
      entryPoint: [
        'traefik',
        '--providers.ecs.clusters', this.cluster.clusterName,
        '--providers.ecs.defaultRule', 'Host(`{{ trimSuffix "-app" (trimPrefix "service-" .Name) }}`)',
        '--log.level', 'DEBUG',
        '--api.insecure', 'true',
      ],
      logging: LogDriver.awsLogs({
        streamPrefix: 'traefik-demo-service',
        logRetention: RetentionDays.ONE_WEEK,
      }),
    });
    this.gatewayService = new ApplicationLoadBalancedFargateService(this, 'Gateway', {
      cluster: gatewayCluster,
      serviceName: 'traefik-demo-gateway',
      taskDefinition: gatewayTaskDefinition,
      assignPublicIp: true,
    });
    this.gatewayService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '1');
    this.gatewayService.targetGroup.configureHealthCheck({
      healthyHttpCodes: '200-299,404',
    });
    this.gatewayService.taskDefinition.taskRole.addToPrincipalPolicy(new PolicyStatement({
      sid: 'TraefikECSReadAccess',
      actions: [
        "ecs:ListClusters",
        "ecs:DescribeClusters",
        "ecs:ListTasks",
        "ecs:DescribeTasks",
        "ecs:DescribeContainerInstances",
        "ecs:DescribeTaskDefinition",
        "ec2:DescribeInstances",
      ],
      effect: Effect.ALLOW,
      resources: ['*'],
    }));
    this.gatewayService.service.connections.allowFromAnyIpv4(Port.tcp(8080));

    this.serviceSecurityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'traefik-demo-ecs',
    });

    this.addService('hello');
    this.addService('foo');
  }

  addService(name: string) {
    const image = ContainerImage.fromRegistry("httpd:2.4");

    const taskDefinition = new FargateTaskDefinition(this, `TaskDefinition-${name}`);
    taskDefinition.addContainer('app', {
      image,
      entryPoint: ['/bin/sh', '-c'],
      command: [`/bin/sh -c "echo 'Hello World! This is the ${name} service. My name is $(hostname)' > /usr/local/apache2/htdocs/index.html && httpd-foreground"`],
      portMappings: [
        {containerPort: 80, protocol: Protocol.TCP},
      ],
    });


    const service = new FargateService(this, `Service-${name}`, {
      cluster: this.cluster,
      securityGroups: [this.serviceSecurityGroup],
      taskDefinition: taskDefinition,
      desiredCount: 1,
      serviceName: name,
    });
    service.connections.allowFrom(this.gatewayService.service, Port.tcp(80))
  }
}
