<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LabAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! self::check($request)) {
            return response()->json([
                'message' => 'Please enter the lab password first.',
                'code' => 'unauthenticated',
            ], 401);
        }

        return $next($request);
    }

    /** True when this session passed the password gate and has not outlived LAB_SESSION_HOURS. */
    public static function check(Request $request): bool
    {
        if (! $request->hasSession()) {
            return false;
        }

        $session = $request->session();

        if ($session->get('lab_auth') !== true) {
            return false;
        }

        $since = (int) $session->get('lab_auth_at', 0);

        if ($since <= 0 || now()->timestamp - $since > config('lab.session_hours') * 3600) {
            $session->forget(['lab_auth', 'lab_auth_at']);

            return false;
        }

        return true;
    }
}
