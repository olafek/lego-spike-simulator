<?php

namespace App\Services\Vision;

/** Offline fixture: always returns the same stored extraction. It does not look at the pictures. */
class MockVisionRecogniser implements VisionRecogniser
{
    public function recognise(array $images, string $prompt): array
    {
        return json_decode(file_get_contents(resource_path('lab/mock-extraction.json')), true, flags: JSON_THROW_ON_ERROR);
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
