---
name: testing-strategies
description: Comprehensive testing approaches including unit, integration, and end-to-end testing patterns
license: Apache-2.0
compatibility: opencode
---

# Testing Strategies Skill

This skill provides patterns and best practices for writing effective tests.

## When to Use

Use this skill when:
- Setting up testing infrastructure
- Writing new tests
- Improving test coverage
- Debugging test failures
- Choosing testing tools

## Testing Fundamentals

### The Testing Pyramid
- Unit tests (70%) - Fast, isolated, cheap
- Integration tests (20%) - Medium speed, test interactions
- E2E tests (10%) - Slow, realistic, expensive

### Test Quality Attributes
- Fast (< 100ms per test ideally)
- Independent (no shared state)
- Repeatable (same results every time)
- Self-validating (pass/fail clearly)
- Timely (written with or before code)

## Unit Testing

### Best Practices
- Test one concept per test
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Test edge cases and errors

### Test Structure
```typescript
describe('Calculator', () => {
  describe('add', () => {
    it('should return sum of two positive numbers', () => {
      // Arrange
      const calc = new Calculator();
      
      // Act
      const result = calc.add(2, 3);
      
      // Assert
      expect(result).toBe(5);
    });
    
    it('should handle negative numbers', () => {
      const calc = new Calculator();
      const result = calc.add(-2, -3);
      expect(result).toBe(-5);
    });
  });
});
```

### Mocking Strategies
- Mock external APIs
- Mock database calls
- Mock file system operations
- Mock time (Date.now)
- Mock randomness

## Integration Testing

### Database Testing
- Use test database (in-memory or dedicated)
- Reset state between tests
- Test transactions
- Verify data integrity
- Test migrations

### API Testing
- Test all endpoints
- Verify status codes
- Check response schemas
- Test authentication
- Test error scenarios

### Component Testing
- Render components in isolation
- Test user interactions
- Verify state changes
- Check accessibility
- Test responsive behavior

## End-to-End Testing

### Best Practices
- Test critical user journeys
- Avoid testing implementation details
- Use data-testid attributes
- Handle async operations
- Clean up test data

### Test Scenarios
- User registration/login
- Complete purchase flow
- CRUD operations
- Search functionality
- File uploads

### Tools
- Playwright (recommended)
- Cypress
- Selenium
- Puppeteer

## Test Coverage

### Goals by Layer
- Business logic: >90%
- Utilities: >80%
- Components: >70%
- API routes: >80%
- Integration points: >75%

### Coverage Reports
- Use coverage tools (Istanbul, c8)
- Track trends over time
- Focus on meaningful coverage
- Don't chase 100% blindly
- Identify untested critical paths

## Testing Tools by Language

### PHP / Laravel
- **Pest** (recommended) — Elegant, expressive syntax built on PHPUnit
- **PHPUnit** — Standard PHP testing framework
- **Laravel Testing** — Built-in HTTP, database, queue, and mail testing
- **Laravel Dusk** — Browser testing with ChromeDriver
- **Mockery** — Mock objects for PHP
- **Faker** — Realistic test data generation (built into Laravel factories)

```php
// Pest test (Laravel)
it('creates a user via API', function () {
    $response = $this->postJson('/api/users', [
        'name' => 'John Doe',
        'email' => 'john@example.com',
    ]);

    $response->assertStatus(201)
             ->assertJsonStructure(['id', 'name', 'email']);

    $this->assertDatabaseHas('users', ['email' => 'john@example.com']);
});

// Laravel model factory + test
it('lists active users', function () {
    User::factory()->count(3)->active()->create();
    User::factory()->count(2)->inactive()->create();

    $this->getJson('/api/users?status=active')
         ->assertOk()
         ->assertJsonCount(3, 'data');
});
```

### JavaScript/TypeScript
- Jest or Vitest (unit)
- React Testing Library (components)
- Playwright (e2e)
- MSW (API mocking)

### Python
- pytest (unit/integration)
- pytest-asyncio (async)
- factory-boy (fixtures)
- Playwright (e2e)

### Go
- Testing package (built-in)
- Testify (assertions)
- GoMock (mocking)
- Playwright (e2e)

### Rust
- Built-in test framework
- Mockall (mocking)
- Playwright (e2e)