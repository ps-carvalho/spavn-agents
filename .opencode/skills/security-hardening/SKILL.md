---
name: security-hardening
description: Security best practices, vulnerability detection, and secure coding patterns
license: Apache-2.0
compatibility: opencode
---

# Security Hardening Skill

This skill provides guidance for writing secure code and identifying vulnerabilities.

## When to Use

Use this skill when:
- Reviewing code for security issues
- Implementing authentication/authorization
- Handling sensitive data
- Setting up security headers
- Auditing dependencies

## Security Principles

### Core Concepts
- Defense in depth
- Principle of least privilege
- Fail securely
- Keep it simple
- Don't trust user input
- Security through obscurity is not security

### Threat Model
- Identify assets
- Identify threats
- Identify vulnerabilities
- Assess risk
- Mitigate threats

## Common Vulnerabilities

### OWASP Top 10 (2021)
1. Broken Access Control
2. Cryptographic Failures
3. Injection
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable Components
7. ID and Auth Failures
8. Software Integrity Failures
9. Logging Failures
10. SSRF

### Injection Attacks
- SQL Injection
- NoSQL Injection
- Command Injection
- LDAP Injection
- XPath Injection

Prevention:
- Use parameterized queries
- Input validation
- ORM/ODM libraries
- WAF rules

### XSS (Cross-Site Scripting)
- Stored XSS
- Reflected XSS
- DOM-based XSS

Prevention:
- Output encoding
- Content Security Policy
- HttpOnly cookies
- Input sanitization

### CSRF (Cross-Site Request Forgery)
Prevention:
- CSRF tokens
- SameSite cookies
- Double-submit cookies
- Custom headers

## Authentication & Authorization

### Password Security
- Strong hashing (bcrypt, Argon2)
- Salt generation
- Password complexity rules
- Rate limiting on auth endpoints
- Account lockout policies

### Session Management
- Secure session IDs
- Session timeout
- Secure cookie attributes
- Session invalidation on logout
- Concurrent session handling

### JWT Security
- Strong signing algorithms (RS256, ES256)
- Short expiration times
- Refresh token rotation
- Secure token storage
- Token revocation

### Authorization Patterns
- RBAC (Role-Based Access Control)
- ABAC (Attribute-Based Access Control)
- OAuth 2.0 scopes
- API key management
- Claims-based authorization

## Data Protection

### Encryption
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Key management (KMS, Vault)
- Database encryption (TDE)
- Field-level encryption

### Secrets Management
- Never commit secrets to code
- Use environment variables
- Secrets management tools (Vault, AWS Secrets Manager)
- Regular rotation
- Least privilege access

### PII Handling
- Data minimization
- Anonymization/pseudonymization
- Consent management
- Right to erasure
- Audit logging

## Secure Coding Practices

### Input Validation
- Whitelist validation
- Type checking
- Length limits
- Format validation (regex)
- Sanitization

### Output Encoding
- HTML encoding
- JavaScript encoding
- URL encoding
- CSS encoding
- JSON encoding

### Error Handling
- Don't leak sensitive info
- Generic error messages
- Log detailed errors securely
- Fail securely
- Stack trace exposure

## Security Headers

Essential headers:
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Strict-Transport-Security
- Referrer-Policy
- Permissions-Policy

## Dependency Security

### Vulnerability Management
- Regular dependency audits
- Automated scanning (Snyk, Dependabot)
- SBOM generation
- License compliance
- Version pinning

### Supply Chain Security
- Verify package signatures
- Use lock files
- Private registries
- Provenance attestation
- Reproducible builds

## Security Testing

### Static Analysis (SAST)
- Semgrep
- SonarQube
- Bandit (Python)
- ESLint security plugin

### Dynamic Analysis (DAST)
- OWASP ZAP
- Burp Suite
- Nikto

### Dependency Scanning
- npm audit
- Snyk
- OWASP Dependency-Check

### Penetration Testing
- Reconnaissance
- Vulnerability scanning
- Exploitation
- Post-exploitation
- Reporting