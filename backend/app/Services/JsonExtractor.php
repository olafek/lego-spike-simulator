<?php

namespace App\Services;

use App\Exceptions\LabException;

class JsonExtractor
{
    /**
     * Pull one JSON object out of model text. Tolerates ```json fences and
     * chatter around the object; anything else is an ai_bad_response.
     */
    public static function object(string $text): array
    {
        $text = trim($text);

        if (preg_match('/```(?:json)?\s*(.*?)```/is', $text, $m)) {
            $text = trim($m[1]);
        }

        $decoded = json_decode($text, true);

        if (! is_array($decoded)) {
            $start = strpos($text, '{');
            $end = strrpos($text, '}');

            if ($start !== false && $end !== false && $end > $start) {
                $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
            }
        }

        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new LabException(
                'ai_bad_response',
                'The robot brain gave a confusing answer. Please try again.',
                502,
                [],
                'Model output was not a JSON object ('.strlen($text).' chars).',
            );
        }

        return $decoded;
    }
}
