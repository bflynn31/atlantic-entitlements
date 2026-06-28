from rest_framework.routers import DefaultRouter
from .views import SubscriptionViewSet, UserViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"subscriptions", SubscriptionViewSet, basename="subscription")

urlpatterns = router.urls
