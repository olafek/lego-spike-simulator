<?php

/*
| SPIKE Lab configuration. Every lab/AI environment variable is read here and
| nowhere else, so `php artisan config:cache` works in production.
*/

return [

    // Single shared site password. Empty = nobody can log in (503), by design.
    'password' => (string) env('LAB_ACCESS_PASSWORD', ''),

    'session_hours' => max(1, (int) env('LAB_SESSION_HOURS', 8)),

    'login' => [
        'max_attempts' => max(1, (int) env('LAB_LOGIN_MAX_ATTEMPTS', 5)),
        'cooldown_seconds' => max(5, (int) env('LAB_LOGIN_COOLDOWN_SECONDS', 60)),
    ],

    'limits' => [
        'ai_requests_per_hour' => max(0, (int) env('LAB_MAX_AI_REQUESTS_PER_HOUR', 30)),
        // An IP is usually a whole classroom behind one router, so it gets a multiple.
        'ai_requests_per_hour_ip_multiplier' => 6,
        'upload_mb' => max(1, (int) env('LAB_MAX_UPLOAD_MB', 8)),
        'screenshots_per_project' => max(1, (int) env('LAB_MAX_SCREENSHOTS_PER_PROJECT', 6)),
        'image_dimension' => max(256, (int) env('LAB_MAX_IMAGE_DIMENSION', 4096)),
        'concurrent_analyses' => max(1, (int) env('LAB_MAX_CONCURRENT_ANALYSES', 2)),
        'uploads_per_hour' => max(1, (int) env('LAB_MAX_UPLOADS_PER_HOUR', 60)),
        'projects_per_session_per_hour' => max(1, (int) env('LAB_MAX_PROJECTS_PER_SESSION_PER_HOUR', 30)),
        'project_data_bytes' => 600 * 1024,
    ],

    'retention_days' => max(1, (int) env('LAB_RETENTION_DAYS', 30)),

    // Screenshot recognition. AI Brain is text-only, so vision uses its own driver.
    'vision' => [
        'driver' => strtolower((string) env('VISION_DRIVER', 'mock')), // mock | openai
        'timeout' => max(5, (int) env('VISION_TIMEOUT', 90)),
        'openai' => [
            'key' => (string) env('OPENAI_API_KEY', ''),
            'model' => (string) env('OPENAI_MODEL', ''),
            'base_url' => rtrim((string) env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), '/'),
        ],
    ],

    // AI Brain gateway (text only): explanations and mission-scene proposals.
    'aibrain' => [
        'base_url' => (string) env('AIBRAIN_BASE_URL', ''),
        'key' => (string) env('AIBRAIN_API_KEY', ''),
        'model' => (string) env('AIBRAIN_MODEL', ''), // informational; the gateway picks the model from the token
        'timeout' => max(5, (int) env('AIBRAIN_TIMEOUT', 60)),
    ],
];
