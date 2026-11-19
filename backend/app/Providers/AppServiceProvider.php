<?php

namespace App\Providers;

use App\Services\Ai\AiProvider;
use App\Services\Ai\GeminiProvider;
use App\Services\Ai\MockAiProvider;
use App\Services\Ai\OpenAiProvider;
use App\Services\Ai\UnconfiguredAiProvider;
use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(AiProvider::class, function () {
            $name = (string) config('lab.ai.provider');
            $timeout = (int) config('lab.ai.timeout');

            return match ($name) {
                'mock' => new MockAiProvider,
                'openai' => new OpenAiProvider(config('lab.ai.openai.key'), config('lab.ai.openai.model'), config('lab.ai.openai.base_url'), $timeout),
                'gemini' => new GeminiProvider(config('lab.ai.gemini.key'), config('lab.ai.gemini.model'), config('lab.ai.gemini.base_url'), $timeout),
                default => new UnconfiguredAiProvider($name),
            };
        });
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
