<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\LabException;
use App\Http\Controllers\Api\Concerns\ReadsUploadedImage;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Screenshot;
use App\Services\Images\ImageProcessor;
use App\Services\UsageLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * The mat picture: one straightened photo of a table per project, shown as the floor.
 * The browser straightens the photo; the server only ever receives the finished mat rectangle.
 * It is stored like a screenshot (private disk, re-encoded) but with kind = 'mat', so it never
 * mixes with the program screenshots.
 */
class MatImageController extends Controller
{
    use ReadsUploadedImage;

    public function store(Request $request, UsageLimiter $usage, ImageProcessor $images, string $id): JsonResponse
    {
        $project = Project::with('matImage')->findOrFail($id);
        $file = $this->uploadedImage($request);

        $usage->consume($request, 'upload');

        $image = $images->process((string) file_get_contents($file->getRealPath()));
        $old = $project->matImage;
        $shot = ScreenshotController::persist($project, $image, 0, $file->getClientOriginalName(), 'mat');

        $old?->delete();
        $project->touch();

        return response()->json($shot->toMatApi(), 201);
    }

    public function destroy(string $id): JsonResponse
    {
        $project = Project::with('matImage')->findOrFail($id);

        if ($project->matImage !== null) {
            $project->matImage->delete();
            $project->touch();
        }

        return response()->json(['deleted' => true]);
    }

    /**
     * Put a saved table onto a project: its picture is copied here; the scene is copied by the
     * frontend from `tableData`, because the project document belongs to the frontend.
     * Both projects are found through the usual visibility rules (lab, or one demo visitor's own).
     */
    public function useTable(Request $request, string $id): JsonResponse
    {
        $project = Project::findOrFail($id);
        $tableId = $request->input('tableId');

        if (! is_string($tableId) || $tableId === '' || $tableId === $project->id) {
            throw new LabException('validation', 'Choose a table to use.');
        }

        $table = Project::findOrFail($tableId);

        if (! $table->is_table) {
            throw new LabException('not_a_table', 'That is not a saved table.');
        }

        self::copy($table, $project);
        $project->touch();

        return response()->json($project->load(['screenshots', 'matImage'])->toApi() + ['tableData' => $table->decodedData()]);
    }

    /** Give $to a copy of the mat picture of $from (or no picture, when $from has none). */
    public static function copy(Project $from, Project $to): void
    {
        $to->matImage()->get()->each->delete();
        $source = $from->matImage()->first();
        $bytes = $source === null ? null : Storage::disk('local')->get($source->path);

        if ($source === null || $bytes === null) {
            return;
        }

        $ext = pathinfo($source->path, PATHINFO_EXTENSION);
        $path = "screenshots/{$to->id}/".bin2hex(random_bytes(12)).".{$ext}";
        Storage::disk('local')->put($path, $bytes);

        Screenshot::create([
            'project_id' => $to->id,
            'kind' => 'mat',
            'position' => 0,
            'path' => $path,
            'mime' => $source->mime,
            'width' => $source->width,
            'height' => $source->height,
            'bytes' => $source->bytes,
            'original_name' => $source->original_name,
        ]);
    }
}
