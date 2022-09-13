# aws-traefik-cdk-demo

Deploys a minimal Traefik + AWS ECS demo consisting of

* a VPC
* two ECS Fargate clusters
* a AWS Cloud Map private DNS namespace
* a couple of simple ECS services running a hello world app
* a [Traefik](https://traefik.io/) proxy (as ECS task) configured to automatically discover & route the ECS services
* A loadbalancer in front of the proxy

After deployment, the service is reachable via the URL of the Loadbalancer (see output of `cdk deploy`).
In this example, Traefik is configured for Host-based routing, so to reach the service you need to specify the correct
host header. For sake of simplicity, no DNS / Route53 setup is included here, so you need to do that manually, e.g.

```
curl -H 'Host: hello' http://<dns-name-of-loadbalancer>/ # 1st service
curl -H 'Host: foo' http://<dns-name-of-loadbalancer>/   # 2nd service
curl -H 'Host: other' http://<dns-name-of-loadbalancer>/ # 404
```

The Traefik dashboard can be reached via `http://<public-ip-of-gateway-task>:8080`.

## Useful commands

* `npm ci`                     install dependencies
* `npm run cdk -- deploy`      deploy this stack to your default AWS account/region
* `npm run cdk -- diff`        compare deployed stack with current state
* `npm run cdk -- synth`       emits the synthesized CloudFormation template
