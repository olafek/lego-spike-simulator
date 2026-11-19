<?php

namespace App\Services;

use App\Exceptions\LabException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Server-side hourly quotas, counted per browser session and per IP address.
 * Counters live in the cache store, never in the browser.
 */
class UsageLimiter
{
    private const WINDOW = 3600;

    /** @return array<string,int> cache key => max per hour (session bucket first) */
    private function buckets(Request $request, string $kind): array
    {
        // lab_sid is a random id minted at login; it survives session-id regeneration.
        $session = $request->hasSession() ? (string) $request->session()->get('lab_sid', 'none') : 'none';
        $ip = $request->ip() ?? 'unknown';

        $perSession = (int) match ($kind) {
            'ai' => config('lab.limits.ai_requests_per_hour'),
            'upload' => config('lab.limits.uploads_per_hour'),
            'project' => config('lab.limits.projects_per_session_per_hour'),
        };

        // One IP is usually a whole classroom behind one router, so it gets a multiple.
        $perIp = $perSession * (int) config('lab.limits.ai_requests_per_hour_ip_multiplier');

        return [
            "lab:{$kind}:s:{$session}" => $perSession,
            "lab:{$kind}:ip:".sha1($ip) => $perIp,
        ];
    }

    /** Count one use of $kind, or throw a 429 with a friendly message. */
    public function consume(Request $request, string $kind): void
    {
        $buckets = $this->buckets($request, $kind);

        foreach ($buckets as $key => $max) {
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $retry = max(1, RateLimiter::availableIn($key));
                $minutes = (int) ceil($retry / 60);

                throw new LabException(
                    $kind === 'ai' ? 'quota' : 'rate_limited',
                    match ($kind) {
                        'ai' => "The robot brain needs a rest. Try again in about {$minutes} min.",
                        'upload' => "That is a lot of pictures! Try again in about {$minutes} min.",
                        default => "That is a lot of projects! Try again in about {$minutes} min.",
                    },
                    429,
                    ['retryAfter' => $retry],
                );
            }
        }

        foreach (array_keys($buckets) as $key) {
            RateLimiter::hit($key, self::WINDOW);
        }
    }

    public function remaining(Request $request, string $kind): int
    {
        $left = PHP_INT_MAX;

        foreach ($this->buckets($request, $kind) as $key => $max) {
            $left = min($left, RateLimiter::remaining($key, $max));
        }

        return max(0, $left);
    }

    public function snapshot(Request $request): array
    {
        $out = [];

        foreach (['ai', 'upload', 'project'] as $kind) {
            $buckets = $this->buckets($request, $kind);
            $sessionKey = array_key_first($buckets);
            $out[$kind] = [
                'limitPerHour' => $buckets[$sessionKey],
                'used' => (int) RateLimiter::attempts($sessionKey),
                'remaining' => $this->remaining($request, $kind),
                'resetsInSeconds' => (int) RateLimiter::availableIn($sessionKey),
            ];
        }

        return $out;
    }
}
