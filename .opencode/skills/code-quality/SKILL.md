---
name: code-quality
description: Refactoring patterns, code maintainability, and best practices for clean code
license: Apache-2.0
compatibility: opencode
---

# Code Quality Skill

This skill provides patterns for writing clean, maintainable, and high-quality code.

## When to Use

Use this skill when:
- Refactoring existing code
- Code reviewing
- Setting up linting/formatting
- Improving code maintainability
- Reducing technical debt

## Clean Code Principles

### SOLID Principles
- **S**ingle Responsibility Principle
- **O**pen/Closed Principle
- **L**iskov Substitution Principle
- **I**nterface Segregation Principle
- **D**ependency Inversion Principle

### DRY (Don't Repeat Yourself)
- Extract duplicated logic
- Create reusable functions
- Use composition
- Avoid copy-paste programming

### KISS (Keep It Simple, Stupid)
- Simple solutions over clever ones
- Avoid premature optimization
- Clear naming over comments
- Small functions and classes

### YAGNI (You Aren't Gonna Need It)
- Don't add functionality until needed
- Avoid speculative generality
- Iterate based on requirements
- Simple first, generalize later

## Refactoring Patterns

### Extract Method
Move code block into separate method with descriptive name.

Before:
```typescript
function processOrder(order) {
  // validate
  if (!order.items || order.items.length === 0) {
    throw new Error('Order must have items');
  }
  if (!order.customerId) {
    throw new Error('Order must have customer');
  }
  
  // calculate total
  let total = 0;
  for (const item of order.items) {
    total += item.price * item.quantity;
  }
  
  // save
  database.save(order);
}
```

After:
```typescript
function processOrder(order) {
  validateOrder(order);
  order.total = calculateTotal(order.items);
  database.save(order);
}

function validateOrder(order) {
  if (!order.items?.length) {
    throw new Error('Order must have items');
  }
  if (!order.customerId) {
    throw new Error('Order must have customer');
  }
}

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

### Replace Conditional with Polymorphism
Use inheritance/polymorphism instead of switch statements.

### Introduce Parameter Object
Group related parameters into an object.

### Remove Dead Code
Delete unused functions, variables, and comments.

### Rename Variable/Function
Use descriptive, intention-revealing names.

## Code Organization

### File Structure
- One class/component per file
- Cohesive modules
- Clear folder hierarchy
- Index files for clean imports

### Naming Conventions
- Classes: PascalCase (UserController)
- Functions/Variables: camelCase (getUserById)
- Constants: UPPER_SNAKE_CASE (MAX_RETRIES)
- Private: _prefixed (_internalMethod)
- Boolean: is/has/should prefix (isValid)

### Import Organization
Group imports:
1. Built-in modules
2. External libraries
3. Internal modules
4. Relative imports

Sort alphabetically within groups.

## Language-Specific Quality

### TypeScript
- Use strict mode
- Prefer interfaces for objects
- Use type for unions/tuples
- Avoid `any`
- Use unknown for error handling
- Leverage discriminated unions

### Python
- Follow PEP 8
- Use type hints
- Prefer dataclasses
- Use list/dict comprehensions
- Handle exceptions explicitly
- Write docstrings

### Go
- Format with gofmt
- Use golint and go vet
- Keep functions small
- Return errors, don't panic
- Use interfaces for abstraction
- Write table-driven tests

### PHP
- Follow PSR-12 coding standard
- Use strict types (`declare(strict_types=1)`)
- Leverage PHP 8+ features (enums, readonly, named args, match)
- Use type declarations for params, returns, and properties
- Follow Laravel conventions (if using Laravel)
- Use dependency injection over facades in application code

### Rust
- Run cargo fmt and clippy
- Use Result/Option
- Leverage ownership system
- Write documentation comments
- Avoid unwrap/expect in production
- Use enums for state machines

## Code Review Checklist

### Functionality
- [ ] Works as intended
- [ ] Handles edge cases
- [ ] No obvious bugs
- [ ] Error handling appropriate

### Readability
- [ ] Naming is clear
- [ ] Functions are focused
- [ ] Comments explain why, not what
- [ ] No magic numbers/strings

### Maintainability
- [ ] No code duplication
- [ ] SOLID principles followed
- [ ] Easy to test
- [ ] Properly documented

### Performance
- [ ] No obvious bottlenecks
- [ ] Efficient algorithms
- [ ] Resource cleanup
- [ ] Appropriate data structures

### Security
- [ ] No injection vulnerabilities
- [ ] Input validation
- [ ] No sensitive data exposure
- [ ] Proper auth checks

## Linting and Formatting

### Configuration
- Share configs across team
- Integrate with CI/CD
- Pre-commit hooks
- Editor integration
- Gradual adoption for legacy

### Tools
- **ESLint** - JavaScript/TypeScript
- **Prettier** - Multi-language formatter
- **PHP CS Fixer** - PHP formatter (PSR-12)
- **Laravel Pint** - Laravel's opinionated PHP formatter (built on CS Fixer)
- **PHPStan / Larastan** - PHP static analysis (levels 0-9)
- **Psalm** - PHP static analysis with type inference
- **Black** - Python formatter
- **Ruff** - Python linter
- **gofmt** - Go formatter
- **rustfmt** - Rust formatter
- **RuboCop** - Ruby

## Technical Debt Management

### Identify Debt
- Code smells
- Complex functions
- Outdated dependencies
- Missing tests
- Documentation gaps

### Prioritize
- Impact vs effort analysis
- Business risk assessment
- Frequency of changes
- Team productivity impact

### Address Strategy
- Boy Scout Rule: Leave it better
- Refactoring sprints
- Incremental improvements
- Big-bang rewrites (last resort)

## Documentation

### Code Documentation
- JSDoc/TSDoc for public APIs
- Docstrings for Python
- Comments for complex logic
- README for modules
- Architecture Decision Records (ADRs)

### Living Documentation
- Keep docs with code
- Use tools that extract from code
- Examples in documentation
- Regular reviews and updates