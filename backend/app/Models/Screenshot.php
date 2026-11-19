<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Screenshot extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected static function booted(): void
    {
        static::creating(function (Screenshot $shot) {
            $shot->id ??= bin2hex(random_bytes(12));
        });

        static::deleting(function (Screenshot $shot) {
            Storage::disk('local')->delete($shot->path);
        });
    }

    public function url(): string
    {
        // Authenticated route; the updated_at stamp only busts the browser cache after a crop/rotate.
        return "/api/projects/{$this->project_id}/screenshots/{$this->id}/image?v=".($this->updated_at?->timestamp ?? 0);
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'position' => (int) $this->position,
            'url' => $this->url(),
            'width' => (int) $this->width,
            'height' => (int) $this->height,
            'mime' => $this->mime,
        ];
    }
}
