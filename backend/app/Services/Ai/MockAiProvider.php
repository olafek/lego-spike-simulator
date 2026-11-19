<?php

namespace App\Services\Ai;

use App\Exceptions\LabException;

/**
 * Offline provider. Screenshot reading always returns the same stored example (it does not
 * look at the pictures); the text helpers are simply switched off.
 */
class MockAiProvider implements AiProvider
{
    public function recognise(array $images, string $prompt): array
    {
        return json_decode(file_get_contents(resource_path('lab/mock-extraction.json')), true, flags: JSON_THROW_ON_ERROR);
    }

    public function text(string $system, string $user): string
    {
        throw new LabException('ai_not_configured', 'The helper robot is not set up yet. Ask your teacher.', 503, [], 'AI_PROVIDER is mock: no text model.');
    }

    public function driver(): string
    {
        return 'mock';
    }

    public function model(): ?string
    {
        return null;
    }

    public function live(): bool
    {
        return false;
    }
}
