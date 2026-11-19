<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\LabException;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Screenshot;
use App\Services\Images\ImageProcessor;
use App\Services\UsageLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class ScreenshotController extends Controller
{
    public function store(Request $request, UsageLimiter $usage, ImageProcessor $images, string $id): JsonResponse
    {
        $project = Project::with('screenshots')->findOrFail($id);
        $file = $request->file('image');

        if ($file === null) {
            // Also the case when PHP dropped the upload for exceeding upload_max_filesize.
            throw new LabException('invalid_image', 'We did not get a picture. It may be too big (limit '.config('lab.limits.upload_mb').' MB).');
        }

        if (! $file->isValid()) {
            if (in_array($file->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
                throw new LabException('too_large', 'That picture is too big. The limit is '.config('lab.limits.upload_mb').' MB.');
            }

            throw new LabException('upload_failed', 'The picture did not arrive properly. Please try again.', 500, [], 'PHP upload error code '.$file->getError());
        }

        $replaces = null;
        if (is_string($request->input('replaces')) && $request->input('replaces') !== '') {
            $replaces = $project->screenshots->firstWhere('id', $request->input('replaces'));

            if ($replaces === null) {
                throw new LabException('not_found', 'We could not find the screenshot to replace.', 404);
            }
        }

        if ($replaces === null && $project->screenshots->count() >= config('lab.limits.screenshots_per_project')) {
            throw new LabException(
                'too_many_screenshots',
                'A project can hold up to '.config('lab.limits.screenshots_per_project').' screenshots. Remove one first.',
            );
        }

        // Size is checked before the bytes are read into memory.
        if ($file->getSize() > config('lab.limits.upload_mb') * 1024 * 1024) {
            throw new LabException('too_large', 'That picture is too big. The limit is '.config('lab.limits.upload_mb').' MB.');
        }

        $usage->consume($request, 'upload');

        $image = $images->process((string) file_get_contents($file->getRealPath()));

        $position = $replaces?->position ?? ((int) $project->screenshots->max('position') + ($project->screenshots->isEmpty() ? 0 : 1));
        $shot = self::persist($project, $image, $position, $file->getClientOriginalName());

        $replaces?->delete();
        $project->touch();

        return response()->json($shot->toApi(), 201);
    }

    /** @param array{bytes:string,mime:string,ext:string,width:int,height:int} $image */
    public static function persist(Project $project, array $image, int $position, ?string $originalName): Screenshot
    {
        $path = "screenshots/{$project->id}/".bin2hex(random_bytes(12)).'.'.$image['ext'];
        Storage::disk('local')->put($path, $image['bytes']);

        $name = $originalName === null ? null : mb_substr(preg_replace('/[^\w.\- ]+/u', '_', basename($originalName)) ?? '', 0, 120);

        return Screenshot::create([
            'project_id' => $project->id,
            'position' => $position,
            'path' => $path,
            'mime' => $image['mime'],
            'width' => $image['width'],
            'height' => $image['height'],
            'bytes' => strlen($image['bytes']),
            'original_name' => $name ?: null,
        ]);
    }

    public function reorder(Request $request, string $id): JsonResponse
    {
        $project = Project::with('screenshots')->findOrFail($id);
        $ids = $request->input('ids');
        $existing = $project->screenshots->pluck('id')->all();

        if (! is_array($ids) || count($ids) !== count($existing) || array_diff($existing, $ids) !== []) {
            throw new LabException('validation', 'The screenshot order did not match this project.');
        }

        foreach (array_values($ids) as $position => $sid) {
            Screenshot::where('project_id', $project->id)->where('id', $sid)->update(['position' => $position]);
        }

        $project->touch();

        return response()->json($project->screenshots()->get()->map->toApi()->values()->all());
    }

    public function destroy(string $id, string $sid): JsonResponse
    {
        $shot = Screenshot::where('project_id', $id)->where('id', $sid)->firstOrFail();
        $shot->delete();
        Project::find($id)?->touch();

        return response()->json(['deleted' => true]);
    }

    public function image(string $id, string $sid): Response
    {
        $shot = Screenshot::where('project_id', $id)->where('id', $sid)->firstOrFail();
        $bytes = Storage::disk('local')->get($shot->path);

        abort_if($bytes === null, 404);

        return response($bytes, 200, [
            'Content-Type' => $shot->mime,
            'Content-Length' => (string) strlen($bytes),
            'Cache-Control' => 'private, max-age=3600',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
        ]);
    }
}
