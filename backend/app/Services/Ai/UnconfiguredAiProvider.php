<?php

namespace App\Services\Ai;

use App\Exceptions\LabException;

/** Used when AI_PROVIDER names something unknown. Never falls back to the mock silently. */
class UnconfiguredAiProvider implements AiProvider
{
    public function __construct(private readonly string $name) {}

    public function recognise(array $images, string $prompt): array
    {
        throw $this->error('Screenshot reading is not set up yet. Ask your teacher.');
    }

    public function text(string $system, string $user): string
    {
        throw $this->error('The helper robot is not set up yet. Ask your teacher.');
    }

    public function driver(): string
    {
        return $this->name;
    }

    public function model(): ?string
    {
        return null;
    }

    public function live(): bool
    {
        return false;
    }

    private function error(string $message): LabException
    {
        return new LabException('ai_not_configured', $message, 503, [], "Unknown AI_PROVIDER '{$this->name}' (expected mock, openai or gemini).");
    }
}
