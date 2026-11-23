<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\LabException;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Screenshot;
use App\Services\Images\ImageProcessor;
use App\Services\UsageLimiter;
use App\Support\Demo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProjectController extends Controller
{
    public function index(): JsonResponse
    {
        $projects = Project::with('screenshots')->orderByDesc('updated_at')->limit(50)->get();

        return response()->json($projects->map->toListItem()->values()->all());
    }

    public function store(Request $request, UsageLimiter $usage): JsonResponse
    {
        $usage->consume($request, 'project');

        $project = Project::create([
            'name' => $this->cleanName($request->input('name')) ?? 'My SPIKE program',
            'data' => $this->dataFrom($request),
        ]);

        return response()->json($project->load('screenshots')->toApi(), 201);
    }

    public function show(string $id): JsonResponse
    {
        $project = Project::with('screenshots')->findOrFail($id);
        $project->forceFill(['last_opened_at' => now()])->saveQuietly();

        return response()->json($project->toApi());
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $project = Project::findOrFail($id);
        $body = $this->body($request);

        if (property_exists($body, 'name') && ($name = $this->cleanName($body->name)) !== null) {
            $project->name = $name;
        }

        if (property_exists($body, 'data')) {
            $project->data = $this->dataFrom($request);
        }

        $project->updated_at = now(); // saving always counts as activity for retention
        $project->save();

        return response()->json($project->load('screenshots')->toApi());
    }

    public function destroy(string $id): JsonResponse
    {
        $project = Project::with('screenshots')->findOrFail($id);
        $project->screenshots->each->delete();
        $project->matImage?->delete();
        $project->delete();

        return response()->json(['deleted' => true]);
    }

    public function duplicate(Request $request, UsageLimiter $usage, string $id): JsonResponse
    {
        $source = Project::with('screenshots')->findOrFail($id);
        $usage->consume($request, 'project');

        $copy = DB::transaction(function () use ($source) {
            $copy = Project::create([
                'name' => mb_substr($source->name.' (copy)', 0, 120),
                'data' => $source->data,
            ]);

            foreach ($source->screenshots as $shot) {
                $bytes = Storage::disk('local')->get($shot->path);

                if ($bytes === null) {
                    continue;
                }

                $ext = pathinfo($shot->path, PATHINFO_EXTENSION);
                $path = "screenshots/{$copy->id}/".bin2hex(random_bytes(12)).".{$ext}";
                Storage::disk('local')->put($path, $bytes);

                Screenshot::create([
                    'project_id' => $copy->id,
                    'position' => $shot->position,
                    'path' => $path,
                    'mime' => $shot->mime,
                    'width' => $shot->width,
                    'height' => $shot->height,
                    'bytes' => $shot->bytes,
                    'original_name' => $shot->original_name,
                ]);
            }

            MatImageController::copy($source, $copy);

            return $copy;
        });

        return response()->json($copy->load('screenshots')->toApi(), 201);
    }

    public function export(string $id): JsonResponse
    {
        $project = Project::with('screenshots')->findOrFail($id);

        return response()->json([
            'format' => 'spike-lab-project',
            'version' => 1,
            'exportedAt' => now()->toIso8601String(),
            'name' => $project->name,
            'data' => $project->decodedData(),
            'screenshots' => $project->screenshots->map(fn (Screenshot $shot) => [
                'position' => (int) $shot->position,
                'mime' => $shot->mime,
                'width' => (int) $shot->width,
                'height' => (int) $shot->height,
                'dataBase64' => base64_encode((string) Storage::disk('local')->get($shot->path)),
            ])->values()->all(),
        ]);
    }

    public function import(Request $request, UsageLimiter $usage, ImageProcessor $images): JsonResponse
    {
        if (Demo::active()) {
            throw new LabException('demo_disabled', 'Opening project files is switched off in the demo.', 403);
        }

        $body = $this->body($request);

        if (($body->format ?? null) !== 'spike-lab-project') {
            throw new LabException('invalid_import', 'That file is not a SPIKE Lab project.');
        }

        if (($body->version ?? null) !== 1) {
            throw new LabException('invalid_import', 'That project file comes from a different SPIKE Lab version.');
        }

        $shots = $body->screenshots ?? [];

        if (! is_array($shots) || count($shots) > config('lab.limits.screenshots_per_project')) {
            throw new LabException('invalid_import', 'That project file has too many screenshots.');
        }

        $data = $this->encodeData($body->data ?? null);

        // Validate every picture by content before anything is stored.
        $processed = [];
        foreach ($shots as $i => $shot) {
            $raw = is_object($shot) && is_string($shot->dataBase64 ?? null) ? base64_decode($shot->dataBase64, true) : false;

            if ($raw === false) {
                throw new LabException('invalid_import', 'A screenshot in that project file is broken.');
            }

            $processed[] = ['position' => is_int($shot->position ?? null) ? max(0, $shot->position) : $i] + $images->process($raw);
        }

        $usage->consume($request, 'project');

        $project = DB::transaction(function () use ($body, $data, $processed) {
            $project = Project::create([
                'name' => $this->cleanName($body->name ?? null) ?? 'Imported project',
                'data' => $data,
            ]);

            foreach ($processed as $image) {
                ScreenshotController::persist($project, $image, $image['position'], null);
            }

            return $project;
        });

        return response()->json($project->load('screenshots')->toApi(), 201);
    }

    private function body(Request $request): object
    {
        $body = json_decode($request->getContent() ?: '{}');

        return is_object($body) ? $body : (object) [];
    }

    /** `data` is taken from the raw JSON body so {} and [] survive the round trip. */
    private function dataFrom(Request $request): ?string
    {
        return $this->encodeData($this->body($request)->data ?? null);
    }

    private function encodeData(mixed $data): ?string
    {
        if ($data === null) {
            return null;
        }

        if (! is_object($data)) {
            throw new LabException('validation', 'Project data must be a JSON object.');
        }

        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($json === false || strlen($json) > config('lab.limits.project_data_bytes')) {
            throw new LabException('too_large', 'This project is too big to save. Try removing some blocks or objects.', 413);
        }

        return $json;
    }

    private function cleanName(mixed $name): ?string
    {
        if (! is_string($name)) {
            return null;
        }

        $name = trim(preg_replace('/[\x00-\x1F\x7F<>]+/u', ' ', $name) ?? '');

        return $name === '' ? null : mb_substr($name, 0, 120);
    }
}
