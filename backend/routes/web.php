<?php

use App\Http\Controllers\Api\AiController;
use App\Http\Controllers\Api\MatImageController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ScreenshotController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Middleware\LabAuth;
use App\Support\Demo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
| Everything runs in the "web" group: server-side session + CSRF.
|
|   /api/*        the lab. Only session and login are reachable without the lab password.
|   /demo/api/*   the optional public demo (LAB_DEMO_ENABLED). Same endpoints, no password,
|                 but fenced off: own projects only, offline AI, tight limits. See App\Support\Demo.
*/

$notFound = fn () => response()->json(['message' => 'We could not find that.', 'code' => 'not_found'], 404);

$protected = function () {
    Route::get('usage', [SessionController::class, 'usage']);

    Route::get('projects', [ProjectController::class, 'index']);
    Route::post('projects', [ProjectController::class, 'store']);
    Route::post('projects/import', [ProjectController::class, 'import']);
    Route::get('projects/{id}', [ProjectController::class, 'show']);
    Route::put('projects/{id}', [ProjectController::class, 'update']);
    Route::delete('projects/{id}', [ProjectController::class, 'destroy']);
    Route::post('projects/{id}/duplicate', [ProjectController::class, 'duplicate']);
    Route::get('projects/{id}/export', [ProjectController::class, 'export']);

    Route::post('projects/{id}/screenshots', [ScreenshotController::class, 'store']);
    Route::put('projects/{id}/screenshots/order', [ScreenshotController::class, 'reorder']);
    Route::delete('projects/{id}/screenshots/{sid}', [ScreenshotController::class, 'destroy']);
    Route::get('projects/{id}/screenshots/{sid}/image', [ScreenshotController::class, 'image']);

    Route::post('projects/{id}/mat-image', [MatImageController::class, 'store']);
    Route::delete('projects/{id}/mat-image', [MatImageController::class, 'destroy']);

    Route::post('projects/{id}/recognise', [AiController::class, 'recognise']);
    Route::post('ai/explain', [AiController::class, 'explain']);
    Route::post('ai/scene', [AiController::class, 'scene']);
};

Route::prefix('demo/api')->middleware('lab.demo')->group(function () use ($protected, $notFound) {
    Route::get('session', [SessionController::class, 'show']);
    Route::middleware('lab.auth')->group($protected);
    Route::any('{any}', $notFound)->where('any', '.*');
});

Route::prefix('api')->group(function () use ($protected, $notFound) {
    Route::get('session', [SessionController::class, 'show']);
    Route::post('login', [SessionController::class, 'login']);
    Route::post('logout', [SessionController::class, 'logout']);
    Route::middleware('lab.auth')->group($protected);
    Route::any('{any}', $notFound)->where('any', '.*');
});

// SPA shell. The built JS/CSS in /spa holds no private data; all content comes from the gated API.
$spa = function (Request $request) {
    $path = trim($request->path(), '/');
    $demo = Demo::enabled() && ($path === 'demo' || str_starts_with($path, 'demo/'));

    if (! $demo && ! LabAuth::check($request) && $path !== 'login') {
        return redirect('/login');
    }

    $index = public_path('spa/index.html');

    if (is_file($index)) {
        return response(file_get_contents($index), 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    return response(
        '<!doctype html><meta charset="utf-8"><title>SPIKE Lab</title>'
        .'<body style="font-family:system-ui;padding:2rem"><h1>SPIKE Lab backend is running</h1>'
        .'<p>The frontend is not built yet. Run <code>npm run dev</code> in <code>/frontend</code> '
        .'(development) or <code>npm run build</code> (production) and reload.</p></body>',
        200,
        ['Content-Type' => 'text/html; charset=UTF-8'],
    );
};

Route::get('/', $spa);
Route::fallback($spa);
