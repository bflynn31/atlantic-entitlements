from django.contrib import admin
from .models import Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "product", "start_date", "end_date", "revoked_at", "created_at"]
    list_filter = ["product"]
    search_fields = ["user__username", "user__email"]
