from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view, inline_serializer
from rest_framework import fields as f
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Subscription
from .serializers import ActiveSubscriptionSerializer, SubscriptionSerializer, UserSerializer

# Maps each product to the entitlement flags it grants.
# Union semantics: a flag is True if ANY active subscription grants it.
_PRODUCT_GRANTS: dict[str, set[str]] = {
    Subscription.DIGITAL: {"can_read_web"},
    Subscription.PRINT: {"can_read_web", "can_receive_print"},
    Subscription.PREMIUM: {"can_read_web", "can_receive_print", "ad_free"},
}

_ALL_FLAGS = ["can_read_web", "can_receive_print", "ad_free"]


def _active_filter(qs):
    today = timezone.now().date()
    return qs.filter(
        revoked_at__isnull=True,
        start_date__lte=today,
    ).filter(Q(end_date__isnull=True) | Q(end_date__gt=today))


_EntitlementsResponse = inline_serializer(
    name="EntitlementsResponse",
    fields={
        "user_id": f.IntegerField(),
        "entitlements": inline_serializer(
            name="EntitlementFlags",
            fields={
                "can_read_web": f.BooleanField(),
                "can_receive_print": f.BooleanField(),
                "ad_free": f.BooleanField(),
            },
        ),
        "active_subscriptions": ActiveSubscriptionSerializer(many=True),
    },
)


@extend_schema_view(
    list=extend_schema(summary="List all users"),
    create=extend_schema(summary="Create a user"),
    retrieve=extend_schema(summary="Get a user by ID"),
)
class UserViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer

    @extend_schema(
        summary="Get live entitlements for a user",
        description=(
            "Computes entitlements in real time as the union of all active subscription grants. "
            "A subscription is active when revoked_at is null, start_date ≤ today, "
            "and end_date is null or end_date > today."
        ),
        responses={200: _EntitlementsResponse},
    )
    @action(detail=True, methods=["get"])
    def entitlements(self, request, pk=None):
        user = self.get_object()
        active_subs = list(_active_filter(user.subscriptions.all()))

        granted: set[str] = set()
        for sub in active_subs:
            granted |= _PRODUCT_GRANTS.get(sub.product, set())

        return Response(
            {
                "user_id": user.id,
                "entitlements": {flag: flag in granted for flag in _ALL_FLAGS},
                "active_subscriptions": ActiveSubscriptionSerializer(active_subs, many=True).data,
            }
        )


@extend_schema_view(
    list=extend_schema(
        summary="List subscriptions",
        parameters=[
            OpenApiParameter("user", int, description="Filter by user ID"),
            OpenApiParameter("product", str, description="Filter by product (DIGITAL, PRINT, PREMIUM)"),
            OpenApiParameter("active", str, enum=["true"], description="Return only currently active subscriptions"),
        ],
    ),
    create=extend_schema(summary="Grant a subscription to a user"),
    retrieve=extend_schema(summary="Get a subscription by ID"),
    destroy=extend_schema(summary="Hard-delete a subscription (admin only)"),
)
class SubscriptionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        qs = Subscription.objects.select_related("user").order_by("-created_at")
        params = self.request.query_params

        if user_id := params.get("user"):
            qs = qs.filter(user_id=user_id)
        if product := params.get("product"):
            qs = qs.filter(product__iexact=product)
        if params.get("active") == "true":
            qs = _active_filter(qs)

        return qs

    @extend_schema(
        summary="Revoke a subscription",
        description="Sets revoked_at to the current timestamp. Idempotent state is rejected — revoking an already-revoked subscription returns 400.",
        request=None,
        responses={
            200: SubscriptionSerializer,
            400: OpenApiResponse(description="Already revoked"),
        },
    )
    @action(detail=True, methods=["patch"])
    def revoke(self, request, pk=None):
        sub = self.get_object()
        if sub.revoked_at is not None:
            return Response({"detail": "Subscription is already revoked."}, status=status.HTTP_400_BAD_REQUEST)
        sub.revoked_at = timezone.now()
        sub.save(update_fields=["revoked_at"])
        return Response(SubscriptionSerializer(sub).data)
