<?php

namespace App\Services\Vision;

/**
 * The single boundary between SPIKE Lab and any vision model.
 *
 * Contract: given screenshots (in reading order) and the extraction prompt,
 * return the decoded JSON object the model produced ({stacks:[...], notes:[...]}).
 * The backend does not interpret that object; the frontend validates it strictly.
 * Implementations throw App\Exceptions\LabException with code
 * ai_not_configured (503), ai_unavailable (502) or ai_bad_response (502).
 */
interface VisionRecogniser
{
    /**
     * @param  list<array{mime:string,bytes:string}>  $images
     * @return array<string,mixed>
     */
    public function recognise(array $images, string $prompt): array;

    public function driver(): string;

    public function model(): ?string;

    /** True when this driver really reads the pictures (i.e. not the mock) and is configured. */
    public function live(): bool;
}
