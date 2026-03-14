---
name: django-patterns
description: Django 5+ ORM patterns, class-based views, REST Framework, Celery, Channels, testing, and deployment best practices
license: Apache-2.0
compatibility: opencode
---

# Django Patterns Skill

This skill provides patterns and best practices for building scalable web applications and APIs with Django 5+ and Django REST Framework.

## When to Use

Use this skill when:
- Building web applications or REST APIs with Python
- Needing a batteries-included framework with ORM, admin, auth, and migrations
- Working with complex data models and relational database queries
- Building APIs with Django REST Framework (DRF)
- Adding real-time features with Django Channels
- Needing background task processing with Celery
- Creating admin interfaces for data management

## Project Structure

```
project/
  manage.py
  config/                       # Project configuration (renamed from project name)
    __init__.py
    settings/
      base.py                   # Shared settings
      development.py            # Dev-specific settings
      production.py             # Production settings
      test.py                   # Test settings
    urls.py                     # Root URL configuration
    wsgi.py                     # WSGI entry point
    asgi.py                     # ASGI entry point (Channels)
    celery.py                   # Celery configuration
  apps/
    users/
      __init__.py
      models.py                 # Data models
      views.py                  # View functions or CBVs
      serializers.py            # DRF serializers
      viewsets.py               # DRF viewsets
      urls.py                   # App URL patterns
      admin.py                  # Admin configuration
      forms.py                  # Django forms
      managers.py               # Custom model managers
      signals.py                # Signal handlers
      tasks.py                  # Celery tasks
      permissions.py            # DRF custom permissions
      filters.py                # django-filter filtersets
      factories.py              # factory_boy factories
      tests/
        test_models.py
        test_views.py
        test_serializers.py
        conftest.py             # pytest fixtures
    orders/
      ...
    core/                       # Shared app (base models, utils)
      models.py                 # Abstract base models
      middleware.py              # Custom middleware
      exceptions.py             # Custom exception handlers
      pagination.py             # Custom pagination classes
      permissions.py            # Shared permissions
  templates/                    # HTML templates (if needed)
  static/                       # Static files
  requirements/
    base.txt
    development.txt
    production.txt
```

## ORM Patterns

### Models and Managers

```python
from django.db import models
from django.db.models import Q, F, Count, Avg
from django.utils import timezone


class TimestampedModel(models.Model):
    """Abstract base model with created/updated timestamps."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UserManager(models.Manager):
    def active(self):
        return self.filter(is_active=True)

    def with_order_stats(self):
        return self.annotate(
            order_count=Count("orders"),
            avg_order_total=Avg("orders__total"),
        )

    def search(self, query: str):
        return self.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(email__icontains=query)
        )


class User(TimestampedModel):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.USER)
    is_active = models.BooleanField(default=True)

    objects = UserManager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["role", "is_active"]),
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def deactivate(self):
        self.is_active = False
        self.save(update_fields=["is_active", "updated_at"])


class Order(TimestampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="orders")
    status = models.CharField(max_length=20, choices=OrderStatus.choices)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
```

### Advanced QuerySet Operations

```python
Order.objects.select_related("user").filter(status="pending")   # JOIN to prevent N+1 on FK
User.objects.prefetch_related("orders").active()                 # Separate query for reverse/M2M
Order.objects.filter(total__gt=F("discount") * 2)               # F expressions
User.objects.aggregate(total=Count("id"), active=Count("id", filter=Q(is_active=True)))
User.objects.annotate(latest=Subquery(                           # Subquery
    Order.objects.filter(user=OuterRef("pk")).order_by("-created_at").values("total")[:1]
))
User.objects.filter(role="trial").update(is_active=False)        # Bulk update
Order.objects.bulk_create([Order(user=u, total=0) for u in users])
```

## Django REST Framework

### Serializers and ViewSets

```python
class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    orders_count = serializers.IntegerField(read_only=True)
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "full_name", "role", "orders_count"]
        read_only_fields = ["id"]

class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    class Meta:
        model = User
        fields = ["email", "first_name", "last_name", "password", "role"]
    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["role", "is_active"]
    search_fields = ["first_name", "last_name", "email"]

    def get_queryset(self):
        return User.objects.with_order_stats()
    def get_serializer_class(self):
        return CreateUserSerializer if self.action == "create" else UserSerializer

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        self.get_object().deactivate()
        return Response({"status": "deactivated"})

# URLs: router = DefaultRouter(); router.register("users", UserViewSet)
```

## Middleware Pipeline

```
Request -> SecurityMiddleware -> SessionMiddleware -> CommonMiddleware
  -> CsrfViewMiddleware -> AuthenticationMiddleware -> Custom Middleware -> View
Response (middleware runs in reverse order)
```

```python
# Custom middleware
class RequestIDMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        request.id = str(uuid.uuid4())
        response = self.get_response(request)
        response["X-Request-ID"] = request.id
        return response
```

## Celery and Channels

```python
# Celery task with retry
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_payment(self, order_id: int):
    try:
        order = Order.objects.get(id=order_id)
        result = payment_gateway.charge(order.total, order.payment_method)
        order.status = "paid" if result.success else "payment_failed"
        order.save(update_fields=["status", "updated_at"])
    except PaymentGatewayError as exc:
        self.retry(exc=exc)

# Django Channels WebSocket consumer
class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.group_name = f"user_{self.scope['user'].id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
    async def notification(self, event):
        await self.send_json(event["data"])
```

## Testing Patterns

```python
# pytest fixtures
@pytest.fixture
def auth_client(db):
    client = APIClient()
    client.force_authenticate(user=UserFactory(role="admin"))
    return client

class TestUserViewSet:
    def test_create_user(self, auth_client):
        response = auth_client.post("/api/v1/users/", {
            "email": "alice@example.com", "first_name": "Alice",
            "last_name": "Smith", "password": "SecurePass123!",
        })
        assert response.status_code == 201
        assert User.objects.filter(email="alice@example.com").exists()

    def test_unauthorized(self):
        assert APIClient().get("/api/v1/users/").status_code == 401

# Factory
class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
```

## Performance Best Practices

- Use `select_related()` for foreign key joins and `prefetch_related()` for reverse/M2M relations
- Add database indexes on columns used in `filter()`, `order_by()`, and `distinct()`
- Use `only()` or `defer()` to fetch only needed columns on wide tables
- Cache expensive querysets with Django's cache framework and Redis backend
- Use `bulk_create()` and `bulk_update()` for batch operations
- Offload heavy work to Celery tasks (reports, email, external API calls)
- Use `iterator()` or `chunk` processing for large datasets to reduce memory
- Enable persistent database connections with `CONN_MAX_AGE`
- Use `values()` or `values_list()` when you only need dictionaries, not model instances

## Anti-Patterns to Avoid

- **N+1 queries** -- always use `select_related`/`prefetch_related`; use `django-debug-toolbar` to detect
- **Fat views** -- move business logic to services or model methods; views should coordinate, not compute
- **Unvalidated input** -- always use serializers or forms for validation; never trust `request.data` raw
- **Migrations in wrong order** -- never edit or reorder existing migrations; create new ones
- **Signals for business logic** -- signals are for decoupling; use explicit service calls for core logic
- **Ignoring `update_fields`** -- specify `update_fields` in `save()` to avoid race conditions
- **Bare except clauses** -- always catch specific exceptions
- **Hardcoded settings** -- use environment variables via `django-environ` or `os.environ`

## Technology Recommendations

| Concern | Recommended Library |
|---------|-------------------|
| REST API | Django REST Framework |
| Filtering | django-filter |
| Authentication | djangorestframework-simplejwt, dj-rest-auth |
| Task queue | Celery + Redis |
| WebSocket | Django Channels |
| Testing | pytest-django + factory_boy |
| Admin | django-unfold, django-jazzmin, Grappelli |
| Debug | django-debug-toolbar, django-silk |
| CORS | django-cors-headers |
| Settings | django-environ |
| Search | django-elasticsearch-dsl, Meilisearch |
| Caching | Redis (django-redis) |
| File storage | django-storages (S3) |
| Monitoring | Sentry, django-prometheus |
