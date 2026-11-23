<?php

namespace Tests\Feature;

use App\Models\Screenshot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The mat picture: one straightened photo of a table per project, kept apart from the program screenshots.
 */
class MatImageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->signIn();
    }

    private function makeProject(array $body = []): array
    {
        return $this->postJson('/api/projects', $body)->assertCreated()->json();
    }

    private function uploadMat(string $projectId, ?UploadedFile $file = null, string $prefix = '')
    {
        return $this->post("{$prefix}/api/projects/{$projectId}/mat-image", ['image' => $file ?? $this->pngUpload(236, 114, 'table.png')], ['Accept' => 'application/json']);
    }

    private function uploadShot(string $projectId)
    {
        return $this->post("/api/projects/{$projectId}/screenshots", ['image' => $this->pngUpload()], ['Accept' => 'application/json']);
    }

    public function test_upload_shows_on_the_project_and_not_among_screenshots(): void
    {
        $project = $this->makeProject();
        $this->assertNull($project['matImage']);

        $mat = $this->uploadMat($project['id'])->assertCreated()->json();
        $this->assertSame(236, $mat['width']);
        $this->assertSame(114, $mat['height']);

        $shown = $this->getJson("/api/projects/{$project['id']}")->assertOk()->json();
        $this->assertSame($mat['id'], $shown['matImage']['id']);
        $this->assertMatchesRegularExpression("#^/api/projects/{$project['id']}/screenshots/[0-9a-f]{24}/image#", $shown['matImage']['url']);
        $this->assertSame([], $shown['screenshots']);

        $this->get($shown['matImage']['url'])->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    public function test_a_new_picture_replaces_the_old_one(): void
    {
        $project = $this->makeProject();
        $first = $this->uploadMat($project['id'])->assertCreated()->json();
        $firstPath = Screenshot::findOrFail($first['id'])->path;
        $second = $this->uploadMat($project['id'])->assertCreated()->json();

        $this->assertNotSame($first['id'], $second['id']);
        $this->assertSame(1, Screenshot::where('kind', 'mat')->count());
        Storage::disk('local')->assertMissing($firstPath);
    }

    public function test_delete_removes_row_and_file(): void
    {
        $project = $this->makeProject();
        $mat = $this->uploadMat($project['id'])->json();
        $path = Screenshot::findOrFail($mat['id'])->path;

        $this->deleteJson("/api/projects/{$project['id']}/mat-image")->assertOk()->assertJson(['deleted' => true]);

        $this->assertSame(0, Screenshot::count());
        Storage::disk('local')->assertMissing($path);
        $this->assertNull($this->getJson("/api/projects/{$project['id']}")->json('matImage'));
        // deleting when there is none is fine
        $this->deleteJson("/api/projects/{$project['id']}/mat-image")->assertOk();
    }

    public function test_it_does_not_count_against_the_screenshot_limit_or_reach_recognition(): void
    {
        config(['lab.limits.screenshots_per_project' => 1]);
        $project = $this->makeProject();

        $this->uploadMat($project['id'])->assertCreated();
        $shot = $this->uploadShot($project['id'])->assertCreated()->json();

        $read = $this->postJson("/api/projects/{$project['id']}/recognise")->assertOk()->json();
        $this->assertSame([$shot['id']], $read['screenshotIds']);

        $listed = collect($this->getJson('/api/projects')->json())->firstWhere('id', $project['id']);
        $this->assertSame(1, $listed['screenshotCount']);
    }

    public function test_existing_screenshots_stay_program_screenshots(): void
    {
        $project = $this->makeProject();
        $shot = Screenshot::create([
            'project_id' => $project['id'], 'position' => 0, 'path' => "screenshots/{$project['id']}/old.png",
            'mime' => 'image/png', 'width' => 10, 'height' => 10, 'bytes' => 1,
        ]);

        $this->assertSame('program', $shot->refresh()->kind);
        $this->assertCount(1, $this->getJson("/api/projects/{$project['id']}")->json('screenshots'));
    }

    public function test_duplicate_copies_the_mat_picture(): void
    {
        $project = $this->makeProject();
        $mat = $this->uploadMat($project['id'])->json();

        $copy = $this->postJson("/api/projects/{$project['id']}/duplicate")->assertCreated()->json();

        $this->assertNotNull($copy['matImage']);
        $this->assertNotSame($mat['id'], $copy['matImage']['id']);
        $this->get($copy['matImage']['url'])->assertOk();
        $this->assertSame(2, Screenshot::where('kind', 'mat')->count());
    }

    public function test_uploads_use_the_upload_quota_and_size_limit(): void
    {
        config(['lab.limits.upload_mb' => 1, 'lab.limits.uploads_per_hour' => 2]);
        $project = $this->makeProject();
        $big = UploadedFile::fake()->createWithContent('big.png', $this->pngBytes().str_repeat("\0", 1024 * 1024 + 10));

        $this->uploadMat($project['id'], $big)->assertStatus(422)->assertJson(['code' => 'too_large']);
        $this->post("/api/projects/{$project['id']}/mat-image", [], ['Accept' => 'application/json'])->assertStatus(422)->assertJson(['code' => 'invalid_image']);

        $this->uploadMat($project['id'])->assertCreated();
        $this->uploadMat($project['id'])->assertCreated();
        $this->uploadMat($project['id'])->assertStatus(429)->assertJson(['code' => 'rate_limited']);
    }

    public function test_it_needs_the_lab_session(): void
    {
        $project = $this->makeProject();
        $this->flushSession();

        $this->uploadMat($project['id'])->assertStatus(401);
        $this->deleteJson("/api/projects/{$project['id']}/mat-image")->assertStatus(401);
    }

    public function test_demo_visitor_cannot_touch_a_lab_project_picture(): void
    {
        config(['lab.demo.enabled' => true]);
        $project = $this->makeProject();
        $this->uploadMat($project['id'])->assertCreated();
        $this->flushSession();

        $visitor = $this->withSession(['lab_demo_owner' => str_pad('a', 32, '0')]);
        $visitor->post("/demo/api/projects/{$project['id']}/mat-image", ['image' => $this->pngUpload()], ['Accept' => 'application/json'])->assertStatus(404);
        $visitor->deleteJson("/demo/api/projects/{$project['id']}/mat-image")->assertStatus(404);
        $this->assertSame(1, Screenshot::where('kind', 'mat')->count());
    }
}
