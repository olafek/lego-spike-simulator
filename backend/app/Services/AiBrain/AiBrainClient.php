<?php

namespace App\Services\AiBrain;

use App\Exceptions\LabException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Adapter for the AI Brain gateway. TEXT ONLY: the gateway has no image input.
 *
 * Contract (verified against the gateway source):
 *   POST {AIBRAIN_BASE_URL}generate   (multipart/form-data)
 *     token        client token (selects provider + model on the gateway side)
 *     system       system prompt (optional)
 *     user         user prompt (required, non-empty)
 *     assistant    extra context (optional)
 *     temperature  number as string (optional; absent means 0)
 *   200 {"response": "<text>"}
 *   400 {"error": "..."}   provider failure / malformed request
 *   401 {"error": "Unauthorized Client" | "Unauthorized IP"}   (the gateway is IP-whitelisted)
 */
class AiBrainClient
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $key,
        private readonly int $timeout,
    ) {}

    public function configured(): bool
    {
        return $this->baseUrl !== '' && $this->key !== '';
    }

    public function generate(string $system, string $user, ?string $assistant = null, float $temperature = 0.3): string
    {
        if (! $this->configured()) {
            throw new LabException('ai_not_configured', 'The helper robot is not set up yet. Ask your teacher.', 503, [], 'AIBRAIN_BASE_URL or AIBRAIN_API_KEY is empty.');
        }

        $parts = [
            ['name' => 'token', 'contents' => $this->key],
            ['name' => 'temperature', 'contents' => (string) $temperature],
            ['name' => 'system', 'contents' => $system],
            ['name' => 'user', 'contents' => $user],
        ];

        if ($assistant !== null && $assistant !== '') {
            $parts[] = ['name' => 'assistant', 'contents' => $assistant];
        }

        try {
            $response = Http::asMultipart()
                ->timeout($this->timeout)
                ->connectTimeout(10)
                ->acceptJson()
                ->post(rtrim($this->baseUrl, '/').'/generate', $parts);
        } catch (ConnectionException $e) {
            throw new LabException('ai_unavailable', 'The helper robot did not answer in time. Please try again.', 502, [], 'AI Brain connection: '.$e->getMessage());
        }

        $text = $response->json('response');

        if (! $response->successful() || ! is_string($text) || trim($text) === '') {
            throw new LabException(
                'ai_unavailable',
                'The helper robot is not available right now. Please try again in a bit.',
                502,
                [],
                'AI Brain HTTP '.$response->status().': '.mb_substr((string) $response->json('error', ''), 0, 300),
            );
        }

        return trim($text);
    }
}
