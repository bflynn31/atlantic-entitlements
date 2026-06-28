from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Subscription(models.Model):
    DIGITAL = "DIGITAL"
    PRINT = "PRINT"
    PREMIUM = "PREMIUM"

    PRODUCT_CHOICES = [
        (DIGITAL, "Digital"),
        (PRINT, "Print"),
        (PREMIUM, "Premium"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="subscriptions")
    product = models.CharField(max_length=10, choices=PRODUCT_CHOICES)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def is_active(self) -> bool:
        if self.revoked_at is not None:
            return False
        today = timezone.now().date()
        if self.start_date > today:
            return False
        if self.end_date is not None and self.end_date <= today:
            return False
        return True

    def __str__(self) -> str:
        return f"{self.user.username} — {self.product}"
