#!/usr/bin/env python3
from datetime import datetime, timedelta
from collections import deque
from typing import Tuple, Dict, Deque

# Rate limiting configuration
RATE_LIMIT = {
    'requests_per_minute': 5,  # Maximum requests per minute
    'requests_per_hour': 50,   # Maximum requests per hour
    'requests_per_day': 250    # Maximum requests per day
}

# Rate limiting storage
request_timestamps: Dict[str, Deque[datetime]] = {
    'minute': deque(maxlen=RATE_LIMIT['requests_per_minute']),
    'hour': deque(maxlen=RATE_LIMIT['requests_per_hour']),
    'day': deque(maxlen=RATE_LIMIT['requests_per_day'])
}

def check_rate_limit() -> Tuple[bool, str]:
    """Check if the current request exceeds rate limits.
    
    Returns:
        Tuple[bool, str]: (allowed, error_message)
            - allowed: True if request is allowed, False if rate limited
            - error_message: Error message if rate limited, None otherwise
    """
    now = datetime.now()
    
    # Clean up old timestamps
    for window in request_timestamps.values():
        while window and (now - window[0]) > timedelta(days=1):
            window.popleft()
    
    # Check minute limit
    minute_ago = now - timedelta(minutes=1)
    while request_timestamps['minute'] and request_timestamps['minute'][0] < minute_ago:
        request_timestamps['minute'].popleft()
    if len(request_timestamps['minute']) >= RATE_LIMIT['requests_per_minute']:
        return False, "Rate limit exceeded: Too many requests per minute"
    
    # Check hour limit
    hour_ago = now - timedelta(hours=1)
    while request_timestamps['hour'] and request_timestamps['hour'][0] < hour_ago:
        request_timestamps['hour'].popleft()
    if len(request_timestamps['hour']) >= RATE_LIMIT['requests_per_hour']:
        return False, "Rate limit exceeded: Too many requests per hour"
    
    # Check day limit
    day_ago = now - timedelta(days=1)
    while request_timestamps['day'] and request_timestamps['day'][0] < day_ago:
        request_timestamps['day'].popleft()
    if len(request_timestamps['day']) >= RATE_LIMIT['requests_per_day']:
        return False, "Rate limit exceeded: Too many requests per day"
    
    # Add current timestamp to all windows
    request_timestamps['minute'].append(now)
    request_timestamps['hour'].append(now)
    request_timestamps['day'].append(now)
    
    return True, None 