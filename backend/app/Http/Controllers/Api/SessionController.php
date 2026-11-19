<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\LabException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\LabAuth;
use App\Services\AiBrain\AiBrainClient;
use App\Services\UsageLimiter;
use App\Services\Vision\VisionRecogniser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class SessionController extends Controller
{
    /** Public. Also makes sure the browser holds an XSRF-TOKEN cookie (set by the web middleware). */
    public function show(Request $request, UsageLimiter $usage, VisionRecogniser $vision, AiBrainClient $brain): JsonResponse
    {
        $authenticated = LabAuth::check($request);
        $request->session()->token(); // ensure a CSRF token exists

        return response()->json([
            'authenticated' => $authenticated,
            'limits' => [
                'maxUploadMb' => config('lab.limits.upload_mb'),
                'maxScreenshotsPerProject' => config('lab.limits.screenshots_per_project'),
                'maxImageDimension' => config('lab.limits.image_dimension'),
                'maxAiRequestsPerHour' => config('lab.limits.ai_requests_per_hour'),
                'aiRemaining' => $authenticated ? $usage->remaining($request, 'ai') : 0,
            ],
            'vision' => ['driver' => $vision->driver(), 'live' => $vision->live()],
            'assistant' => ['available' => $brain->configured()],
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $expected = (string) config('lab.password');

        if ($expected === '') {
            throw new LabException('not_configured', 'The lab is not open yet. Ask your teacher to set the lab password.', 503);
        }

        $key = 'lab-login:'.sha1((string) $request->ip());
        $max = (int) config('lab.login.max_attempts');
        $cooldown = (int) config('lab.login.cooldown_seconds');

        if (RateLimiter::tooManyAttempts($key, $max)) {
            throw $this->cooldown(RateLimiter::availableIn($key));
        }

        $given = $request->input('password');
        $given = is_string($given) ? $given : '';

        // Hash both sides so the comparison is constant-time and length-independent.
        if (! hash_equals(hash('sha256', $expected), hash('sha256', $given))) {
            RateLimiter::hit($key, $cooldown);
            $left = RateLimiter::remaining($key, $max);

            if ($left <= 0) {
                throw $this->cooldown(RateLimiter::availableIn($key));
            }

            throw new LabException('wrong_password', 'That is not the lab password. Try again!', 422, ['attemptsLeft' => $left]);
        }

        RateLimiter::clear($key);

        $request->session()->regenerate();
        $request->session()->put([
            'lab_auth' => true,
            'lab_auth_at' => now()->timestamp,
            'lab_sid' => bin2hex(random_bytes(16)),
        ]);

        return response()->json(['authenticated' => true]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['authenticated' => false]);
    }

    public function usage(Request $request, UsageLimiter $usage, VisionRecogniser $vision, AiBrainClient $brain): JsonResponse
    {
        return response()->json([
            'usage' => $usage->snapshot($request),
            'limits' => [
                'maxUploadMb' => config('lab.limits.upload_mb'),
                'maxScreenshotsPerProject' => config('lab.limits.screenshots_per_project'),
                'maxImageDimension' => config('lab.limits.image_dimension'),
                'maxAiRequestsPerHour' => config('lab.limits.ai_requests_per_hour'),
                'maxConcurrentAnalyses' => config('lab.limits.concurrent_analyses'),
                'maxUploadsPerHour' => config('lab.limits.uploads_per_hour'),
                'maxProjectsPerHour' => config('lab.limits.projects_per_session_per_hour'),
                'retentionDays' => config('lab.retention_days'),
                'sessionHours' => config('lab.session_hours'),
            ],
            'vision' => ['driver' => $vision->driver(), 'model' => $vision->model(), 'live' => $vision->live()],
            'assistant' => ['available' => $brain->configured()],
        ]);
    }

    private function cooldown(int $seconds): LabException
    {
        $seconds = max(1, $seconds);

        return new LabException('cooldown', "Too many tries. Wait {$seconds} seconds, then try again.", 429, ['retryAfter' => $seconds]);
    }
}
