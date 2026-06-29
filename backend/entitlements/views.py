from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Subscription
from .serializers import SubscriptionSerializer, UserSerializer

# Each product grants a set of entitlement flags.
# A user's final entitlements are the union across all their active subscriptions.
PRODUCT_GRANTS: dict[str, set[str]] = {
    Subscription.DIGITAL: {"can_read_web"},
    Subscription.PRINT:   {"can_read_web", "can_receive_print"},
    Subscription.PREMIUM: {"can_read_web", "can_receive_print", "ad_free"},
}

ALL_FLAGS = ["can_read_web", "can_receive_print", "ad_free"]


def active_subscription_filter(qs):
    """Return only subscriptions that are active right now.

    Active means: not revoked, start_date is in the past, and either no
    end_date or end_date is still in the future.
    """
    today = timezone.now().date()
    return qs.filter(
        revoked_at__isnull=True,
        start_date__lte=today,
    ).filter(Q(end_date__isnull=True) | Q(end_date__gt=today))


class UserViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer

    @action(detail=True, methods=["get"])
    def entitlements(self, request, pk=None):
        user = self.get_object()
        active_subs = list(active_subscription_filter(user.subscriptions.all()))

        granted: set[str] = set()
        for sub in active_subs:
            granted |= PRODUCT_GRANTS.get(sub.product, set())

        return Response({
            "user_id": user.id,
            "entitlements": {flag: flag in granted for flag in ALL_FLAGS},
            "active_subscriptions": SubscriptionSerializer(active_subs, many=True).data,
        })


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
            qs = active_subscription_filter(qs)

        return qs

    @action(detail=True, methods=["patch"])
    def revoke(self, request, pk=None):
        sub = self.get_object()
        if sub.revoked_at is not None:
            return Response({"detail": "Subscription is already revoked."}, status=status.HTTP_400_BAD_REQUEST)
        sub.revoked_at = timezone.now()
        sub.save(update_fields=["revoked_at"])
        return Response(SubscriptionSerializer(sub).data)
