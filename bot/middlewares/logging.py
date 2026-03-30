# Re-export from throttle.py where LoggingMiddleware is defined
from bot.middlewares.throttle import LoggingMiddleware
__all__ = ["LoggingMiddleware"]
