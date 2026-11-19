<?php

namespace App\Services\Vision;

use App\Exceptions\LabException;
use App\Services\JsonExtractor;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * OpenAI Chat Completions with image inputs (data URLs) and JSON-object output.
 */
class OpenAiVisionRecogniser implements VisionRecogniser
{
    public function __construct(
        private readonly string $key,
        private readonly string $model,
        private readonly string $baseUrl,
        private readonly int $timeout,
    ) {}

    public function recognise(array $images, string $prompt): array
    {
        if (! $this->live()) {
            throw new LabException(
                'ai_not_configured',
                'Screenshot reading is not set up yet. Ask your teacher.',
                503,
                [],
                $this->key === '' ? 'OPENAI_API_KEY is empty.' : 'OPENAI_MODEL is not configured.',
            );
        }

        $content = [['type' => 'text', 'text' => 'Read these SPIKE program screenshots (in order) and return the JSON.']];

        foreach ($images as $image) {
            $content[] = [
                'type' => 'image_url',
                'image_url' => [
                    'url' => 'data:'.$image['mime'].';base64,'.base64_encode($image['bytes']),
                    'detail' => 'high',
                ],
            ];
        }

        try {
            $response = Http::withToken($this->key)
                ->timeout($this->timeout)
                ->connectTimeout(10)
                ->acceptJson()
                ->post($this->baseUrl.'/chat/completions', [
                    'model' => $this->model,
                    'response_format' => ['type' => 'json_object'],
                    'messages' => [
                        ['role' => 'system', 'content' => $prompt],
                        ['role' => 'user', 'content' => $content],
                    ],
                ]);
        } catch (ConnectionException $e) {
            throw new LabException('ai_unavailable', 'The robot brain did not answer in time. Please try again.', 502, [], 'OpenAI connection: '.$e->getMessage());
        }

        if (! $response->successful()) {
            throw new LabException(
                'ai_unavailable',
                'The robot brain is not available right now. Please try again in a bit.',
                502,
                [],
                'OpenAI HTTP '.$response->status().': '.mb_substr((string) $response->json('error.message', ''), 0, 300),
            );
        }

        $text = $response->json('choices.0.message.content');

        if (! is_string($text) || trim($text) === '') {
            $why = $response->json('choices.0.message.refusal') ?? $response->json('choices.0.finish_reason') ?? 'empty';

            throw new LabException('ai_bad_response', 'The robot brain gave a confusing answer. Please try again.', 502, [], 'OpenAI returned no content: '.mb_substr((string) $why, 0, 200));
        }

        return JsonExtractor::object($text);
    }

    public function driver(): string
    {
        return 'openai';
    }

    public function model(): ?string
    {
        return $this->model !== '' ? $this->model : null;
    }

    public function live(): bool
    {
        return $this->key !== '' && $this->model !== '';
    }
}
