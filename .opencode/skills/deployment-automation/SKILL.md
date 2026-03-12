---
name: deployment-automation
description: CI/CD pipelines, containerization, cloud deployment, and infrastructure patterns
license: Apache-2.0
compatibility: opencode
---

# Deployment Automation Skill

This skill provides patterns for automating deployment and managing infrastructure.

## When to Use

Use this skill when:
- Setting up CI/CD pipelines
- Dockerizing applications
- Configuring cloud infrastructure
- Setting up monitoring
- Automating deployments

## CI/CD Fundamentals

### Pipeline Stages
1. **Source** - Code commit triggers
2. **Build** - Compile and package
3. **Test** - Run test suites
4. **Security Scan** - Vulnerability checks
5. **Deploy** - Push to environment
6. **Verify** - Smoke tests and health checks

### GitOps Principles
- Git as single source of truth
- Declarative infrastructure
- Automated synchronization
- Drift detection
- Rollback capability

## GitHub Actions

### Workflow Structure
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
      
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh
```

### Best Practices
- Use secrets for sensitive data
- Cache dependencies
- Matrix builds for multiple versions
- Reusable workflows
- Environment protection rules

## Docker

### Dockerfile Best Practices
- Use official base images
- Multi-stage builds
- Non-root user
- Layer caching
- .dockerignore

Example:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
CMD ["node", "dist/index.js"]
```

### Docker Compose
- Service definitions
- Environment variables
- Volume mounting
- Network configuration
- Health checks

## Cloud Deployment

### Container Orchestration
- Kubernetes basics
- Deployments and Services
- ConfigMaps and Secrets
- Ingress controllers
- Horizontal Pod Autoscaling

### Platform-Specific

#### Laravel-Specific Deployment
- **Laravel Forge** — Server provisioning and deployment for PHP (Nginx, MySQL, Redis, SSL)
- **Laravel Vapor** — Serverless deployment on AWS Lambda (auto-scaling, zero maintenance)
- **Laravel Envoyer** — Zero-downtime deployment with rollback
- **Laravel Cloud** — Managed Laravel hosting (PaaS)
- Traditional: Nginx + PHP-FPM + Supervisor (queues) + Redis + MySQL/PostgreSQL

#### AWS
- ECS (Elastic Container Service)
- EKS (Elastic Kubernetes Service)
- Lambda (serverless)
- Elastic Beanstalk
- CodeDeploy

#### GCP
- Cloud Run
- GKE (Google Kubernetes Engine)
- Cloud Functions
- App Engine

#### Azure
- Container Apps
- AKS (Azure Kubernetes Service)
- Azure Functions
- App Service

## Infrastructure as Code

### Terraform
- Providers and resources
- State management
- Modules
- Workspaces
- Remote backends

### Pulumi
- Programming language approach
- State management
- Component resources
- Policy as code

### CloudFormation (AWS)
- Templates
- Stacks
- Change sets
- Stack policies
- Custom resources

## Deployment Strategies

### Basic Strategies
- **Recreate** - Stop old, start new
- **Rolling** - Gradual replacement
- **Blue/Green** - Two identical environments
- **Canary** - Gradual traffic shifting
- **A/B Testing** - Split traffic for testing

### Advanced Patterns
- Feature flags
- Dark launches
- Circuit breakers
- Graceful degradation
- Database migrations with downtime minimization

## Monitoring & Observability

### Logging
- Structured logging (JSON)
- Log levels
- Centralized aggregation
- Log retention policies
- Sensitive data filtering

### Metrics
- Application metrics
- Infrastructure metrics
- Business metrics
- Custom metrics
- SLIs and SLOs

### Alerting
- Alert rules
- Notification channels
- On-call rotations
- Incident response
- Post-mortems

### Tools
- Prometheus + Grafana
- Datadog
- New Relic
- CloudWatch
- Splunk

## Security in DevOps (DevSecOps)

### Shift Left Security
- Security in CI/CD
- Automated scanning
- Policy as code
- Compliance checks

### Container Security
- Image scanning
- Runtime security
- Network policies
- Pod security

### Secrets Management
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault
- Google Secret Manager
- Sealed Secrets

## Performance Optimization

### Build Optimization
- Layer caching
- Parallel builds
- BuildKit features
- Slim base images
- Distroless images

### Runtime Optimization
- Resource limits
- Health checks
- Graceful shutdown
- Connection pooling
- Caching strategies

## Disaster Recovery

### Backup Strategies
- Regular backups
- Point-in-time recovery
- Cross-region replication
- Backup testing
- Retention policies

### High Availability
- Multi-region deployment
- Load balancing
- Auto-scaling
- Health checks
- Circuit breakers