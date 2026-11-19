<?php

namespace App\Services\Ai;

/**
 * The single boundary between SPIKE Lab and any AI service.
 *
 * One provider does all three AI jobs: reading screenshots, explaining a block and
 * proposing a mat. AI never runs the simulation and never edits a program.
 *
 * Implementations throw App\Exceptions\LabException with code
 * ai_not_configured (503), ai_unavailable (502) or ai_bad_response (502).
 */
interface AiProvider
{
    /**
     * Read screenshots (in reading order) with the extraction prompt and return the decoded
     * JSON object the model produced ({stacks:[...], notes:[...]}). The backend does not
     * interpret that object; the frontend validates it strictly.
     *
     * @param  list<array{mime:string,bytes:string}>  $images
     * @return array<string,mixed>
     */
    public function recognise(array $images, string $prompt): array;

    /** Plain text answer to a system + user prompt (no images). */
    public function text(string $system, string $user): string;

    public function driver(): string;

    public function model(): ?string;

    /** True when this provider is a real, fully configured service (never true for the mock). */
    public function live(): bool;
}
