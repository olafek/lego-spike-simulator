<?php

namespace App\Http\Middleware;

use App\Support\Demo;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marks a /demo/api request as a demo request and applies the demo rules for its lifetime:
 * offline AI provider and tighter limits. Runs before lab.auth, which lets demo requests through.
 */
class DemoMode
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! Demo::enabled()) {
            return response()->json(['message' => 'We could not find that.', 'code' => 'not_found'], 404);
        }

        $session = $request->session();
        $owner = $session->get('lab_demo_owner');

        if (! is_string($owner) || strlen($owner) !== 32) {
            $owner = bin2hex(random_bytes(16));
            $session->put('lab_demo_owner', $owner);
        }

        Demo::activate($owner);

        // Demo visitors are strangers: no paid AI, small quotas.
        $overrides = [
            'lab.ai.provider' => 'mock',
            'lab.limits.screenshots_per_project' => config('lab.demo.screenshots_per_project'),
            'lab.limits.upload_mb' => min((int) config('lab.limits.upload_mb'), (int) config('lab.demo.upload_mb')),
            'lab.limits.uploads_per_hour' => config('lab.demo.uploads_per_hour'),
            'lab.limits.projects_per_session_per_hour' => config('lab.demo.projects_per_hour'),
            'lab.limits.ai_requests_per_hour' => config('lab.demo.recognitions_per_hour'),
        ];
        $original = array_map(fn (string $key) => config($key), array_combine(array_keys($overrides), array_keys($overrides)));
        config($overrides);

        try {
            return $next($request);
        } finally {
            // put the lab's own settings back, so the overrides can never outlive this request
            config($original);
        }
    }
}
