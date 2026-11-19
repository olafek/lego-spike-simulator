<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Screenshot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProjectTest extends TestCase
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

    private function upload(string $projectId, ?UploadedFile $file = null, array $extra = [])
    {
        return $this->post("/api/projects/{$projectId}/screenshots", ['image' => $file ?? $this->pngUpload()] + $extra, ['Accept' => 'application/json']);
    }

    public function test_create_read_update_list_delete(): void
    {
        $project = $this->makeProject(['name' => 'Square route', 'data' => ['summary' => '4 blocks', 'program' => ['stacks' => []], 'empty' => (object) []]]);

        $this->assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $project['id']);
        $this->assertSame('Square route', $project['name']);
        $this->assertSame([], $project['screenshots']);

        $shown = $this->getJson("/api/projects/{$project['id']}")->assertOk();
        $shown->assertJsonPath('data.summary', '4 blocks');
        // {} must stay an object and [] an array through storage.
        $this->assertStringContainsString('"empty":{}', $shown->getContent());
        $this->assertStringContainsString('"stacks":[]', $shown->getContent());

        $this->putJson("/api/projects/{$project['id']}", ['data' => ['summary' => '5 blocks']])
            ->assertOk()
            ->assertJsonPath('name', 'Square route')
            ->assertJsonPath('data.summary', '5 blocks');

        $this->putJson("/api/projects/{$project['id']}", ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('name', 'Renamed')
            ->assertJsonPath('data.summary', '5 blocks');

        $this->getJson('/api/projects')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Renamed')
            ->assertJsonPath('0.summary', '5 blocks')
            ->assertJsonPath('0.screenshotCount', 0)
            ->assertJsonPath('0.firstScreenshotUrl', null);

        $this->deleteJson("/api/projects/{$project['id']}")->assertOk();
        $this->getJson("/api/projects/{$project['id']}")->assertStatus(404);
    }

    public function test_project_data_that_is_too_big_or_not_an_object_is_rejected(): void
    {
        $this->postJson('/api/projects', ['data' => ['blob' => str_repeat('x', 700 * 1024)]])->assertStatus(413)->assertJson(['code' => 'too_large']);
        $this->postJson('/api/projects', ['data' => 'just a string'])->assertStatus(422);
        $this->assertSame(0, Project::count());
    }

    public function test_upload_stores_a_private_reencoded_image_and_serves_it_only_when_signed_in(): void
    {
        $project = $this->makeProject();

        $shot = $this->upload($project['id'], $this->pngUpload(120, 80))->assertCreated()->json();

        $this->assertSame(['id', 'position', 'url', 'width', 'height', 'mime'], array_keys($shot));
        $this->assertSame(120, $shot['width']);
        $this->assertSame(80, $shot['height']);
        $this->assertSame('image/png', $shot['mime']);
        $this->assertSame(0, $shot['position']);

        $stored = Screenshot::find($shot['id']);
        Storage::disk('local')->assertExists($stored->path);
        $this->assertStringStartsWith("screenshots/{$project['id']}/", $stored->path);

        $image = $this->get($shot['url'])->assertOk();
        $image->assertHeader('Content-Type', 'image/png');
        $image->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('private', $image->headers->get('Cache-Control'));
        $this->assertNotFalse(imagecreatefromstring($image->getContent()));

        $this->getJson('/api/projects')->assertJsonPath('0.firstScreenshotUrl', $shot['url']);

        // Wrong project id must not leak another project's picture.
        $other = $this->makeProject();
        $this->get("/api/projects/{$other['id']}/screenshots/{$shot['id']}/image")->assertStatus(404);

        $this->flushSession();
        $this->getJson($shot['url'])->assertStatus(401);
    }

    public function test_a_text_file_renamed_to_png_is_rejected_by_content(): void
    {
        $project = $this->makeProject();
        $fake = UploadedFile::fake()->createWithContent('program.png', "<?php echo 'not an image'; ?>");

        $this->upload($project['id'], $fake)->assertStatus(422)->assertJson(['code' => 'invalid_image']);
        $this->assertSame(0, Screenshot::count());
    }

    public function test_a_png_header_with_garbage_body_is_rejected(): void
    {
        $project = $this->makeProject();
        $fake = UploadedFile::fake()->createWithContent('x.png', "\x89PNG\r\n\x1a\n".str_repeat('junk', 50));

        $this->upload($project['id'], $fake)->assertStatus(422)->assertJson(['code' => 'invalid_image']);
    }

    public function test_an_oversized_file_is_rejected(): void
    {
        config(['lab.limits.upload_mb' => 1]);
        $project = $this->makeProject();
        $big = UploadedFile::fake()->createWithContent('big.png', $this->pngBytes().str_repeat("\0", 1024 * 1024 + 10));

        $this->upload($project['id'], $big)->assertStatus(422)->assertJson(['code' => 'too_large']);
        $this->assertSame(0, Screenshot::count());
    }

    public function test_huge_dimensions_are_downscaled_to_the_cap(): void
    {
        config(['lab.limits.image_dimension' => 300]);
        $project = $this->makeProject();

        $shot = $this->upload($project['id'], $this->pngUpload(900, 450))->assertCreated()->json();

        $this->assertSame(300, $shot['width']);
        $this->assertSame(150, $shot['height']);
    }

    public function test_jpeg_metadata_is_stripped_by_reencoding(): void
    {
        $project = $this->makeProject();
        $image = imagecreatetruecolor(40, 40);
        ob_start();
        imagejpeg($image);
        $jpeg = (string) ob_get_clean();
        // Splice a COM segment carrying "secret" metadata right after the SOI marker.
        $comment = 'SECRET-GPS-COMMENT';
        $jpeg = substr($jpeg, 0, 2)."\xFF\xFE".pack('n', strlen($comment) + 2).$comment.substr($jpeg, 2);

        $shot = $this->upload($project['id'], UploadedFile::fake()->createWithContent('p.jpg', $jpeg))->assertCreated()->json();

        $this->assertSame('image/jpeg', $shot['mime']);
        $this->assertStringNotContainsString($comment, Storage::disk('local')->get(Screenshot::find($shot['id'])->path));
    }

    public function test_too_many_screenshots_are_rejected_but_replacing_still_works(): void
    {
        config(['lab.limits.screenshots_per_project' => 2]);
        $project = $this->makeProject();

        $first = $this->upload($project['id'])->assertCreated()->json();
        $second = $this->upload($project['id'])->assertCreated()->json();
        $this->assertSame(1, $second['position']);

        $this->upload($project['id'])->assertStatus(422)->assertJson(['code' => 'too_many_screenshots']);

        // Replace (after crop/rotate) keeps the position and the count.
        $oldPath = Screenshot::find($first['id'])->path;
        $replaced = $this->upload($project['id'], $this->pngUpload(30, 30), ['replaces' => $first['id']])->assertCreated()->json();

        $this->assertSame(0, $replaced['position']);
        $this->assertSame(30, $replaced['width']);
        $this->assertNotSame($first['id'], $replaced['id']);
        $this->assertSame(2, Screenshot::count());
        Storage::disk('local')->assertMissing($oldPath);
    }

    public function test_upload_rate_limit(): void
    {
        config(['lab.limits.uploads_per_hour' => 2, 'lab.limits.screenshots_per_project' => 10]);
        $project = $this->makeProject();

        $this->upload($project['id'])->assertCreated();
        $this->upload($project['id'])->assertCreated();
        $this->upload($project['id'])->assertStatus(429)->assertJson(['code' => 'rate_limited']);
    }

    public function test_reorder_and_delete_screenshots(): void
    {
        $project = $this->makeProject();
        $a = $this->upload($project['id'])->json();
        $b = $this->upload($project['id'])->json();

        $this->putJson("/api/projects/{$project['id']}/screenshots/order", ['ids' => [$b['id'], $a['id']]])
            ->assertOk()
            ->assertJsonPath('0.id', $b['id'])
            ->assertJsonPath('0.position', 0)
            ->assertJsonPath('1.id', $a['id']);

        $this->putJson("/api/projects/{$project['id']}/screenshots/order", ['ids' => [$a['id']]])->assertStatus(422);

        $path = Screenshot::find($a['id'])->path;
        $this->deleteJson("/api/projects/{$project['id']}/screenshots/{$a['id']}")->assertOk();
        Storage::disk('local')->assertMissing($path);

        // The program data is kept when a screenshot is deleted.
        $this->getJson("/api/projects/{$project['id']}")->assertJsonCount(1, 'screenshots');
    }

    public function test_duplicate_copies_data_and_files_independently(): void
    {
        $project = $this->makeProject(['name' => 'Pod push', 'data' => ['summary' => 's']]);
        $shot = $this->upload($project['id'])->json();

        $copy = $this->postJson("/api/projects/{$project['id']}/duplicate")->assertCreated()->json();

        $this->assertNotSame($project['id'], $copy['id']);
        $this->assertSame('Pod push (copy)', $copy['name']);
        $this->assertSame('s', $copy['data']['summary']);
        $this->assertCount(1, $copy['screenshots']);
        $this->assertNotSame($shot['id'], $copy['screenshots'][0]['id']);

        $this->deleteJson("/api/projects/{$project['id']}")->assertOk();
        $this->get($copy['screenshots'][0]['url'])->assertOk();
        Storage::disk('local')->assertDirectoryEmpty("screenshots/{$project['id']}");
    }

    public function test_export_then_import_round_trips_program_and_screenshots(): void
    {
        $project = $this->makeProject(['name' => 'Trip', 'data' => ['summary' => 'x', 'program' => ['stacks' => [['blocks' => [['op' => 'move_for']]]]]]]);
        $this->upload($project['id'], $this->pngUpload(50, 20));

        $export = $this->getJson("/api/projects/{$project['id']}/export")->assertOk()->json();

        $this->assertSame('spike-lab-project', $export['format']);
        $this->assertSame(1, $export['version']);
        $this->assertSame(['position', 'mime', 'width', 'height', 'dataBase64'], array_keys($export['screenshots'][0]));

        $imported = $this->postJson('/api/projects/import', $export)->assertCreated()->json();

        $this->assertNotSame($project['id'], $imported['id']);
        $this->assertSame('Trip', $imported['name']);
        $this->assertSame($export['data'], $imported['data']);
        $this->assertSame(50, $imported['screenshots'][0]['width']);
        $this->get($imported['screenshots'][0]['url'])->assertOk();
    }

    public function test_import_rejects_wrong_format_version_and_fake_images(): void
    {
        $this->postJson('/api/projects/import', ['format' => 'other', 'version' => 1])->assertStatus(422)->assertJson(['code' => 'invalid_import']);
        $this->postJson('/api/projects/import', ['format' => 'spike-lab-project', 'version' => 2])->assertStatus(422);
        $this->postJson('/api/projects/import', [
            'format' => 'spike-lab-project', 'version' => 1, 'name' => 'x', 'data' => (object) [],
            'screenshots' => [['position' => 0, 'mime' => 'image/png', 'dataBase64' => base64_encode('<script>alert(1)</script>')]],
        ])->assertStatus(422)->assertJson(['code' => 'invalid_image']);

        $this->assertSame(0, Project::count());
    }

    public function test_project_creation_is_rate_limited(): void
    {
        config(['lab.limits.projects_per_session_per_hour' => 2]);

        $this->makeProject();
        $this->makeProject();
        $this->postJson('/api/projects')->assertStatus(429)->assertJson(['code' => 'rate_limited']);
    }

    public function test_names_are_sanitised(): void
    {
        $project = $this->makeProject(['name' => "  <b>Hi</b>\n there  "]);

        $this->assertStringNotContainsString('<', $project['name']);
        $this->assertStringNotContainsString("\n", $project['name']);
    }

    public function test_prune_removes_only_stale_projects_and_their_files(): void
    {
        config(['lab.retention_days' => 30]);

        $old = $this->makeProject(['name' => 'old']);
        $this->upload($old['id']);
        $oldPath = Screenshot::where('project_id', $old['id'])->first()->path;
        $fresh = $this->makeProject(['name' => 'fresh']);

        Project::where('id', $old['id'])->update(['updated_at' => now()->subDays(31)]);

        $this->artisan('lab:prune')->assertSuccessful();

        $this->assertNull(Project::find($old['id']));
        $this->assertNotNull(Project::find($fresh['id']));
        Storage::disk('local')->assertMissing($oldPath);
        $this->assertSame(0, Screenshot::count());
    }
}
