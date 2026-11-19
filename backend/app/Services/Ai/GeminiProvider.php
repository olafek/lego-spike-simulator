<?php

namespace App\Services\Ai;

use App\Exceptions\LabException;
use App\Services\JsonExtractor;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Google Gemini generateContent: screenshots as inline_data parts, plain prompts for text.
 * The key travels in the x-goog-api-key header, never in the URL.
 */
class GeminiProvider implements AiProvider
{
    public function __construct(
        private readonly string $key,
        private readonly string $model,
        private readonly string $baseUrl,
        private readonly int $timeout,
    ) {}

    public function recognise(array $images, string $prompt): array
    {
        $this->requireConfigured('Screenshot reading is not set up yet. Ask your teacher.');

        $parts = [['text' => 'Read these SPIKE program screenshots (in order) and return the JSON.']];

        foreach ($images as $image) {
            $parts[] = ['inline_data' => ['mime_type' => $image['mime'], 'data' => base64_encode($image['bytes'])]];
        }

        return JsonExtractor::object($this->generate($prompt, $parts, ['responseMimeType' => 'application/json']));
    }

    public function text(string $system, string $user): string
    {
        $this->requireConfigured('The helper robot is not set up yet. Ask your teacher.');

        return trim($this->generate($system, [['text' => $user]]));
    }

    public function driver(): string
    {
        return 'gemini';
    }

    public function model(): ?string
    {
        return $this->model !== '' ? $this->model : null;
    }

    public function live(): bool
    {
        return $this->key !== '' && $this->model !== '';
    }

    private function requireConfigured(string $message): void
    {
        if (! $this->live()) {
            throw new LabException('ai_not_configured', $message, 503, [], $this->key === '' ? 'GEMINI_API_KEY is empty.' : 'GEMINI_MODEL is not configured.');
        }
    }

    /**
     * @param  list<array<string,mixed>>  $parts
     * @param  array<string,mixed>  $generationConfig
     */
    private function generate(string $system, array $parts, array $generationConfig = []): string
    {
        $payload = [
            'system_instruction' => ['parts' => [['text' => $system]]],
            'contents' => [['role' => 'user', 'parts' => $parts]],
        ];

        if ($generationConfig !== []) {
            $payload['generationConfig'] = $generationConfig;
        }

        try {
            $response = Http::withHeaders(['x-goog-api-key' => $this->key])
                ->timeout($this->timeout)
                ->connectTimeout(10)
                ->acceptJson()
                ->post($this->baseUrl.'/models/'.rawurlencode($this->model).':generateContent', $payload);
        } catch (ConnectionException $e) {
            throw new LabException('ai_unavailable', 'The robot brain did not answer in time. Please try again.', 502, [], 'Gemini connection: '.$e->getMessage());
        }

        if (! $response->successful()) {
            throw new LabException(
                'ai_unavailable',
                'The robot brain is not available right now. Please try again in a bit.',
                502,
                [],
                'Gemini HTTP '.$response->status().': '.mb_substr((string) $response->json('error.message', ''), 0, 300),
            );
        }

        // an answer can arrive split over several text parts
        $text = collect($response->json('candidates.0.content.parts', []))
            ->map(fn ($part) => is_array($part) && is_string($part['text'] ?? null) ? $part['text'] : '')
            ->implode('');

        if (trim($text) === '') {
            $why = $response->json('promptFeedback.blockReason') ?? $response->json('candidates.0.finishReason') ?? 'empty';

            throw new LabException('ai_bad_response', 'The robot brain gave a confusing answer. Please try again.', 502, [], 'Gemini returned no content: '.mb_substr((string) $why, 0, 200));
        }

        return $text;
    }
}
