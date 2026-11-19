<?php

use App\Http\Middleware\LabAuth;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['lab.auth' => LabAuth::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->dontFlash(['password']);

        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Every /api error is JSON shaped {message, code}.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($e instanceof ValidationException) {
                return response()->json([
                    'message' => $e->validator->errors()->first() ?: 'That did not look right.',
                    'code' => 'validation',
                    'errors' => $e->errors(),
                ], 422);
            }

            if ($e instanceof HttpExceptionInterface) {
                $status = $e->getStatusCode();
                [$code, $message] = match ($status) {
                    401 => ['unauthenticated', 'Please enter the lab password first.'],
                    403 => ['forbidden', 'That is not allowed.'],
                    404 => ['not_found', 'We could not find that.'],
                    405 => ['method_not_allowed', 'That action is not available here.'],
                    413 => ['too_large', 'That file is too big.'],
                    419 => ['csrf', 'This page got out of date. Reload it and try again.'],
                    429 => ['rate_limited', 'Too many tries. Take a short break and try again.'],
                    default => ['error', $status >= 500 ? 'Something went wrong in the lab. Try again.' : 'That did not work.'],
                };

                return response()->json(['message' => $message, 'code' => $code], $status, $e->getHeaders());
            }

            return null;
        });
    })->create();
