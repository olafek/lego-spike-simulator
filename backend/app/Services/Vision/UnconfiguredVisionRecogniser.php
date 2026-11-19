<?php

namespace App\Services\Vision;

use App\Exceptions\LabException;

/** Used when VISION_DRIVER names something unknown. Never falls back to the mock silently. */
class UnconfiguredVisionRecogniser implements VisionRecogniser
{
    public function __construct(private readonly string $name) {}

    public function recognise(array $images, string $prompt): array
    {
        throw new LabException(
            'ai_not_configured',
            'Screenshot reading is not set up yet. Ask your teacher.',
            503,
            [],
            "Unknown VISION_DRIVER '{$this->name}' (expected mock or openai).",
        );
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
}
