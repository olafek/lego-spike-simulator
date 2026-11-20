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

    // Optional public demo at /demo: no password, offline AI only, visitors see only their own projects.
    'demo' => [
        'enabled' => (bool) env('LAB_DEMO_ENABLED', false),
        'retention_hours' => max(1, (int) env('LAB_DEMO_RETENTION_HOURS', 24)),
        'screenshots_per_project' => 2,
        'upload_mb' => 5,
        'uploads_per_hour' => 12,
        'projects_per_hour' => 15,
        'recognitions_per_hour' => 20,
    ],

    // One AI provider does every AI job: reading screenshots, explaining a block, proposing a mat.
    // mock = offline stored example (text helpers off) | openai | gemini
    // VISION_DRIVER / VISION_TIMEOUT are still read so older .env files keep working.
    'ai' => [
        'provider' => strtolower((string) env('AI_PROVIDER', env('VISION_DRIVER', 'mock'))),
        'timeout' => max(5, (int) env('AI_TIMEOUT', env('VISION_TIMEOUT', 90))),
        'openai' => [
            'key' => (string) env('OPENAI_API_KEY', ''),
            'model' => (string) env('OPENAI_MODEL', ''),
            // any service that speaks the OpenAI chat-completions format
            'base_url' => rtrim((string) env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), '/'),
        ],
        'gemini' => [
            'key' => (string) env('GEMINI_API_KEY', ''),
            'model' => (string) env('GEMINI_MODEL', ''),
            'base_url' => rtrim((string) env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'), '/'),
        ],
    ],
];
