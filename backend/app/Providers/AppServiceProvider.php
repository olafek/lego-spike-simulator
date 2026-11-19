<?php

namespace App\Providers;

use App\Services\AiBrain\AiBrainClient;
use App\Services\Vision\MockVisionRecogniser;
use App\Services\Vision\OpenAiVisionRecogniser;
use App\Services\Vision\UnconfiguredVisionRecogniser;
use App\Services\Vision\VisionRecogniser;
use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(VisionRecogniser::class, function () {
            $driver = config('lab.vision.driver');

            return match ($driver) {
                'mock' => new MockVisionRecogniser,
                'openai' => new OpenAiVisionRecogniser(
                    config('lab.vision.openai.key'),
                    config('lab.vision.openai.model'),
                    config('lab.vision.openai.base_url'),
                    config('lab.vision.timeout'),
                ),
                default => new UnconfiguredVisionRecogniser((string) $driver),
            };
        });

        $this->app->bind(AiBrainClient::class, fn () => new AiBrainClient(
            config('lab.aibrain.base_url'),
            config('lab.aibrain.key'),
            config('lab.aibrain.timeout'),
        ));
    }

    public function boot(): void
    {
        // `artisan serve` only forwards a whitelist of environment variables to the
        // PHP server. On Windows that drops TEMP/TMP, and every file upload then fails
        // with "unable to create a temporary file".
        if ($this->app->runningInConsole()) {
            ServeCommand::$passthroughVariables = array_values(array_unique([
                ...ServeCommand::$passthroughVariables, 'TEMP', 'TMP', 'TMPDIR',
            ]));
        }
    }
}
