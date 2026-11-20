<?php

namespace App\Models;

use App\Support\Demo;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Project extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = ['last_opened_at' => 'datetime'];

    protected static function booted(): void
    {
        // Lab requests only ever see lab projects; a demo visitor only ever sees their own.
        static::addGlobalScope('demo', function (Builder $query) {
            if (Demo::active()) {
                $query->where('projects.demo_owner', Demo::owner());
            } else {
                $query->whereNull('projects.demo_owner');
            }
        });

        static::creating(function (Project $project) {
            $project->id ??= bin2hex(random_bytes(16));
            $project->demo_owner = Demo::owner();
        });

        static::deleting(function (Project $project) {
            Storage::disk('local')->deleteDirectory("screenshots/{$project->id}");
        });
    }

    public function screenshots(): HasMany
    {
        return $this->hasMany(Screenshot::class)->orderBy('position')->orderBy('created_at');
    }

    /** The stored blob decoded with objects preserved ({} stays {}). */
    public function decodedData(): mixed
    {
        return $this->data === null ? null : json_decode($this->data);
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'data' => $this->decodedData(),
            'screenshots' => $this->screenshots->map->toApi()->values()->all(),
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }

    public function toListItem(): array
    {
        $first = $this->screenshots->first();
        $data = $this->decodedData();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'updatedAt' => $this->updated_at?->toIso8601String(),
            'screenshotCount' => $this->screenshots->count(),
            'firstScreenshotUrl' => $first?->url(),
            'summary' => is_object($data) ? ($data->summary ?? null) : null,
        ];
    }
}
