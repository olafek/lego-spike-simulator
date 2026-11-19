<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * An error with a stable machine `code` and a child-friendly `message`.
 * Technical detail goes in $detail and is only ever logged, never returned.
 */
class LabException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
        public readonly array $extra = [],
        public readonly ?string $detail = null,
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        $response = response()->json(
            ['message' => $this->getMessage(), 'code' => $this->errorCode] + $this->extra,
            $this->status,
        );

        if (isset($this->extra['retryAfter'])) {
            $response->header('Retry-After', (string) $this->extra['retryAfter']);
        }

        return $response;
    }

    public function report(): bool
    {
        if ($this->detail !== null) {
            logger()->warning("lab.{$this->errorCode}: {$this->detail}");
        }

        return true; // handled; never log request input (which could hold the password)
    }
}
