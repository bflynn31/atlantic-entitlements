from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Subscription


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
        )


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ["id", "user", "product", "start_date", "end_date", "revoked_at", "created_at"]
        read_only_fields = ["id", "revoked_at", "created_at"]


# Compact version used in the entitlements response — omits user/created_at.
class ActiveSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ["id", "product", "end_date", "revoked_at"]


# Serializers for the GET /users/{id}/entitlements/ response shape.
class EntitlementFlagsSerializer(serializers.Serializer):
    can_read_web = serializers.BooleanField()
    can_receive_print = serializers.BooleanField()
    ad_free = serializers.BooleanField()


class EntitlementsSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    entitlements = EntitlementFlagsSerializer()
    active_subscriptions = ActiveSubscriptionSerializer(many=True)
