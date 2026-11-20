<?php

namespace Tests\Feature;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The public demo (/demo) must be useful to a stranger and useless for reaching the real lab.
 */
class DemoTest extends TestCase
{
    use RefreshDatabase;

    private function enableDemo(): void
    {
        config(['lab.demo.enabled' => true]);
    }

    /** A demo visitor: no lab password, just their own random owner id in the session. */
    private function visitor(string $owner): static
    {
        return $this->withSession(['lab_demo_owner' => str_pad($owner, 32, '0')]);
    }

    public function test_demo_is_off_by_default(): void
    {
        $this->getJson('/demo/api/session')->assertStatus(404);
        $this->getJson('/demo/api/projects')->assertStatus(404);
        $this->postJson('/demo/api/projects')->assertStatus(404);
        $this->get('/demo')->assertRedirect('/login');
    }

    public function test_demo_needs_no_password_and_says_it_is_a_demo(): void
    {
        $this->enableDemo();

        $this->getJson('/demo/api/session')
            ->assertOk()
            ->assertJsonPath('authenticated', true)
            ->assertJsonPath('demo', true)
            ->assertJsonPath('vision.driver', 'mock')
            ->assertJsonPath('vision.live', false)
            ->assertJsonPath('assistant.available', false)
            ->assertJsonPath('limits.maxScreenshotsPerProject', 2);

        $this->get('/demo')->assertOk();
        $this->get('/demo/projects')->assertOk();

        // the real lab is still locked for the same browser
        $this->getJson('/api/session')->assertJsonPath('authenticated', false)->assertJsonPath('demo', false);
        $this->getJson('/api/projects')->assertStatus(401);
        $this->get('/projects')->assertRedirect('/login');
    }

    public function test_demo_has_no_login_or_logout(): void
    {
        $this->enableDemo();

        $this->postJson('/demo/api/login', ['password' => self::PASSWORD])->assertStatus(404);
        $this->postJson('/demo/api/logout')->assertStatus(404);
    }

    public function test_a_demo_visitor_only_sees_their_own_projects(): void
    {
        $this->enableDemo();

        $mine = $this->visitor('a')->postJson('/demo/api/projects', ['name' => 'Mine'])->assertCreated()->json('id');
        $theirs = $this->visitor('b')->postJson('/demo/api/projects', ['name' => 'Theirs'])->assertCreated()->json('id');

        $this->visitor('a')->getJson('/demo/api/projects')->assertOk()->assertJsonCount(1)->assertJsonPath('0.id', $mine);
        $this->visitor('a')->getJson("/demo/api/projects/{$mine}")->assertOk();

        // another visitor's project does not exist as far as this one can tell
        $this->visitor('a')->getJson("/demo/api/projects/{$theirs}")->assertStatus(404);
        $this->visitor('a')->putJson("/demo/api/projects/{$theirs}", ['name' => 'x'])->assertStatus(404);
        $this->visitor('a')->deleteJson("/demo/api/projects/{$theirs}")->assertStatus(404);
        $this->visitor('a')->postJson("/demo/api/projects/{$theirs}/duplicate")->assertStatus(404);
        $this->visitor('a')->getJson("/demo/api/projects/{$theirs}/export")->assertStatus(404);
        $this->visitor('a')->postJson("/demo/api/projects/{$theirs}/recognise")->assertStatus(404);

        $this->assertSame('Theirs', Project::withoutGlobalScopes()->find($theirs)->name);
    }

    public function test_demo_and_lab_projects_never_mix(): void
    {
        $this->enableDemo();

        $lab = $this->signIn()->postJson('/api/projects', ['name' => 'Lab project'])->assertCreated()->json('id');
        $this->post("/api/projects/{$lab}/screenshots", ['image' => $this->pngUpload()])->assertCreated();
        $demo = $this->visitor('a')->postJson('/demo/api/projects', ['name' => 'Demo project'])->assertCreated()->json('id');

        // a demo visitor cannot list, open, change or read the pictures of a lab project
        $this->visitor('a')->getJson('/demo/api/projects')->assertJsonCount(1)->assertJsonPath('0.id', $demo);
        $this->visitor('a')->getJson("/demo/api/projects/{$lab}")->assertStatus(404);
        $this->visitor('a')->deleteJson("/demo/api/projects/{$lab}")->assertStatus(404);
        $shot = Project::withoutGlobalScopes()->with('screenshots')->find($lab)->screenshots->first();
        $this->visitor('a')->get("/demo/api/projects/{$lab}/screenshots/{$shot->id}/image")->assertStatus(404);
        $this->visitor('a')->deleteJson("/demo/api/projects/{$lab}/screenshots/{$shot->id}")->assertStatus(404);
        $this->assertNotNull(\App\Models\Screenshot::find($shot->id));
        // ...and holding a demo session does not open the lab API
        $this->flushSession();
        $this->visitor('a')->getJson("/api/projects/{$lab}")->assertStatus(401);

        // the lab does not see demo projects either
        $this->signIn()->getJson('/api/projects')->assertJsonCount(1)->assertJsonPath('0.id', $lab);
        $this->signIn()->getJson("/api/projects/{$demo}")->assertStatus(404);
    }

    public function test_demo_uploads_work_with_demo_urls_and_tighter_limits(): void
    {
        $this->enableDemo();
        $id = $this->visitor('a')->postJson('/demo/api/projects')->json('id');

        $shot = $this->visitor('a')->post("/demo/api/projects/{$id}/screenshots", ['image' => $this->pngUpload()])->assertCreated();
        $this->assertStringStartsWith("/demo/api/projects/{$id}/screenshots/", $shot->json('url'));
        $this->visitor('a')->get($shot->json('url'))->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->visitor('b')->get($shot->json('url'))->assertStatus(404);

        $this->visitor('a')->post("/demo/api/projects/{$id}/screenshots", ['image' => $this->pngUpload()])->assertCreated();
        $this->visitor('a')->post("/demo/api/projects/{$id}/screenshots", ['image' => $this->pngUpload()])
            ->assertStatus(422)->assertJson(['code' => 'too_many_screenshots']);

        // the lab keeps its own, larger limit after demo requests
        $this->assertSame(6, config('lab.limits.screenshots_per_project'));
    }

    public function test_demo_never_calls_a_paid_ai_service(): void
    {
        $this->enableDemo();
        config(['lab.ai.provider' => 'openai', 'lab.ai.openai.key' => 'sk-test-key', 'lab.ai.openai.model' => 'm']);
        Http::fake();

        $id = $this->visitor('a')->postJson('/demo/api/projects')->json('id');
        $this->visitor('a')->post("/demo/api/projects/{$id}/screenshots", ['image' => $this->pngUpload()])->assertCreated();

        $this->visitor('a')->postJson("/demo/api/projects/{$id}/recognise")->assertOk()->assertJsonPath('driver', 'mock');
        $this->visitor('a')->postJson('/demo/api/ai/explain', ['blockText' => 'move'])->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);
        $this->visitor('a')->postJson('/demo/api/ai/scene', ['description' => 'a pod'])->assertStatus(503);

        Http::assertNothingSent();
        $this->assertSame('openai', config('lab.ai.provider')); // the lab's setting is untouched
    }

    public function test_demo_quotas_are_separate_from_the_lab(): void
    {
        $this->enableDemo();
        config(['lab.demo.projects_per_hour' => 2]);

        $this->visitor('a')->postJson('/demo/api/projects')->assertCreated();
        $this->visitor('a')->postJson('/demo/api/projects')->assertCreated();
        $this->visitor('a')->postJson('/demo/api/projects')->assertStatus(429)->assertJson(['code' => 'rate_limited']);

        // using up the demo allowance does not block the lab
        $this->flushSession();
        $this->signIn()->postJson('/api/projects')->assertCreated();
    }

    public function test_demo_cannot_import_project_files(): void
    {
        $this->enableDemo();

        $this->visitor('a')->postJson('/demo/api/projects/import', ['format' => 'spike-lab-project', 'version' => 1, 'name' => 'x', 'data' => null, 'screenshots' => []])
            ->assertStatus(403)->assertJson(['code' => 'demo_disabled']);
    }

    public function test_prune_removes_demo_projects_after_a_day_and_keeps_lab_projects(): void
    {
        $this->enableDemo();

        $lab = $this->signIn()->postJson('/api/projects')->json('id');
        $this->flushSession();
        $demo = $this->visitor('a')->postJson('/demo/api/projects')->json('id');
        $this->visitor('a')->post("/demo/api/projects/{$demo}/screenshots", ['image' => $this->pngUpload()])->assertCreated();

        $this->travel(25)->hours();
        $fresh = $this->visitor('a')->postJson('/demo/api/projects')->json('id');
        $this->artisan('lab:prune')->assertSuccessful();

        $remaining = Project::withoutGlobalScopes()->pluck('id')->all();
        $this->assertContains($lab, $remaining);
        $this->assertContains($fresh, $remaining);
        $this->assertNotContains($demo, $remaining);
    }
}
