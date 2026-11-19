<?php

namespace Tests\Feature;

use App\Exceptions\LabException;
use App\Services\AiBrain\AiBrainClient;
use App\Services\Vision\VisionRecogniser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->signIn();
    }

    private function projectWithScreenshot(): string
    {
        $id = $this->postJson('/api/projects')->json('id');
        $this->post("/api/projects/{$id}/screenshots", ['image' => $this->pngUpload()])->assertCreated();

        return $id;
    }

    private function useOpenAi(): void
    {
        config(['lab.vision.driver' => 'openai', 'lab.vision.openai.key' => 'sk-test-key', 'lab.vision.openai.model' => 'vision-model-x']);
    }

    private function openAiAnswer(string $content): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => $content], 'finish_reason' => 'stop']]];
    }

    private function useBrain(): void
    {
        config(['lab.aibrain.base_url' => 'https://brain.test/api/', 'lab.aibrain.key' => 'brain-token']);
    }

    // ---- recognition: mock driver -------------------------------------------------

    public function test_mock_driver_returns_the_stored_fixture_with_its_flagged_block(): void
    {
        $id = $this->projectWithScreenshot();

        $response = $this->postJson("/api/projects/{$id}/recognise")->assertOk();

        $response->assertJsonPath('driver', 'mock')->assertJsonPath('model', null);
        $this->assertCount(1, $response->json('screenshotIds'));

        $raw = $response->json('raw');
        $this->assertSame('when_program_starts', $raw['stacks'][0]['hat']['op']);
        $this->assertSame(['set_movement_motors', 'set_movement_speed', 'move_for', 'motor_run_for', 'move_for'], array_column($raw['stacks'][0]['blocks'], 'op'));
        $this->assertSame(20, $raw['stacks'][0]['blocks'][2]['params']['amount']);
        $this->assertNull($raw['stacks'][0]['blocks'][3]['params']['ports']);
        $this->assertSame(['ports'], $raw['stacks'][0]['blocks'][3]['uncertain']);
        $this->assertNull($raw['stacks'][1]['hat']);
        $this->assertNotEmpty($raw['notes']);
    }

    public function test_recognise_needs_a_screenshot(): void
    {
        $id = $this->postJson('/api/projects')->json('id');

        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(422)->assertJson(['code' => 'no_screenshots']);
    }

    public function test_ai_quota_is_enforced_per_session_and_reported(): void
    {
        config(['lab.limits.ai_requests_per_hour' => 2]);
        $id = $this->projectWithScreenshot();

        $this->getJson('/api/session')->assertJsonPath('limits.aiRemaining', 2);
        $this->postJson("/api/projects/{$id}/recognise")->assertOk();
        $this->postJson("/api/projects/{$id}/recognise")->assertOk();
        $this->getJson('/api/session')->assertJsonPath('limits.aiRemaining', 0);

        $blocked = $this->postJson("/api/projects/{$id}/recognise")->assertStatus(429)->assertJson(['code' => 'quota']);
        $this->assertGreaterThan(0, $blocked->json('retryAfter'));

        $this->getJson('/api/usage')->assertOk()->assertJsonPath('usage.ai.used', 2)->assertJsonPath('usage.ai.remaining', 0);

        $this->travel(61)->minutes();
        $this->signIn()->postJson("/api/projects/{$id}/recognise")->assertOk();
    }

    public function test_ai_quota_also_applies_per_ip_across_sessions(): void
    {
        config(['lab.limits.ai_requests_per_hour' => 1, 'lab.limits.ai_requests_per_hour_ip_multiplier' => 2]);
        $id = $this->projectWithScreenshot();

        $this->signIn('a')->postJson("/api/projects/{$id}/recognise")->assertOk();
        $this->signIn('b')->postJson("/api/projects/{$id}/recognise")->assertOk();
        $this->signIn('c')->postJson("/api/projects/{$id}/recognise")->assertStatus(429)->assertJson(['code' => 'quota']);
    }

    public function test_concurrent_analyses_are_capped_and_slots_are_released(): void
    {
        config(['lab.limits.concurrent_analyses' => 1]);
        $id = $this->projectWithScreenshot();

        $held = Cache::lock('lab:analysis-slot:0', 60);
        $this->assertTrue($held->get());

        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(429)->assertJson(['code' => 'busy']);
        $this->getJson('/api/usage')->assertJsonPath('usage.ai.used', 0); // a busy rejection costs no quota

        $held->release();
        $this->postJson("/api/projects/{$id}/recognise")->assertOk();
        $this->postJson("/api/projects/{$id}/recognise")->assertOk(); // slot was released after the first run
    }

    // ---- recognition: OpenAI driver (always faked) --------------------------------

    public function test_openai_driver_sends_prompt_and_images_and_parses_the_json(): void
    {
        $this->useOpenAi();
        Http::fake(['api.openai.com/*' => Http::response($this->openAiAnswer('{"stacks":[{"hat":null,"blocks":[]}],"notes":["ok"]}'))]);

        $id = $this->postJson('/api/projects')->json('id');
        $this->post("/api/projects/{$id}/screenshots", ['image' => $this->pngUpload(40, 40)])->assertCreated();
        $this->post("/api/projects/{$id}/screenshots", ['image' => $this->pngUpload(60, 60)])->assertCreated();

        $this->postJson("/api/projects/{$id}/recognise")
            ->assertOk()
            ->assertJsonPath('driver', 'openai')
            ->assertJsonPath('model', 'vision-model-x')
            ->assertJsonPath('raw.notes.0', 'ok')
            ->assertJsonCount(2, 'screenshotIds');

        Http::assertSent(function (HttpRequest $request) {
            $body = $request->data();
            $parts = $body['messages'][1]['content'];
            $images = array_values(array_filter($parts, fn ($p) => $p['type'] === 'image_url'));
            $first = base64_decode(explode(',', $images[0]['image_url']['url'], 2)[1]);

            return $request->url() === 'https://api.openai.com/v1/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer sk-test-key')
                && $body['model'] === 'vision-model-x'
                && $body['response_format'] === ['type' => 'json_object']
                && $body['messages'][0]['role'] === 'system'
                && str_contains($body['messages'][0]['content'], 'NEVER GUESS')
                && count($images) === 2
                && str_starts_with($images[0]['image_url']['url'], 'data:image/png;base64,')
                && getimagesizefromstring($first)[0] === 40;
        });
    }

    public function test_openai_fenced_json_is_accepted(): void
    {
        $this->useOpenAi();
        Http::fake(['*' => Http::response($this->openAiAnswer("Here you go:\n```json\n{\"stacks\":[],\"notes\":[]}\n```"))]);
        $id = $this->projectWithScreenshot();

        $this->postJson("/api/projects/{$id}/recognise")->assertOk()->assertJsonPath('raw.stacks', []);
    }

    public function test_openai_non_json_answer_is_a_bad_response_not_a_fake_success(): void
    {
        $this->useOpenAi();
        Http::fake(['*' => Http::response($this->openAiAnswer('I think the robot moves forward.'))]);
        $id = $this->projectWithScreenshot();

        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(502)->assertJson(['code' => 'ai_bad_response']);
    }

    public function test_openai_http_error_is_reported_without_leaking_details(): void
    {
        $this->useOpenAi();
        Http::fake(['*' => Http::response(['error' => ['message' => 'Incorrect API key provided: sk-test-key']], 401)]);
        $id = $this->projectWithScreenshot();

        $response = $this->postJson("/api/projects/{$id}/recognise")->assertStatus(502)->assertJson(['code' => 'ai_unavailable']);

        $this->assertStringNotContainsString('sk-test-key', $response->getContent());
        $this->assertStringNotContainsString('API key', $response->getContent());
    }

    public function test_openai_without_key_or_model_is_not_configured_and_never_falls_back_to_mock(): void
    {
        config(['lab.vision.driver' => 'openai', 'lab.vision.openai.key' => '', 'lab.vision.openai.model' => 'm']);
        Http::fake();
        $id = $this->projectWithScreenshot();

        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);

        config(['lab.vision.openai.key' => 'k', 'lab.vision.openai.model' => '']);
        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);

        Http::assertNothingSent();
        $this->getJson('/api/usage')->assertJsonPath('usage.ai.used', 0);
        $this->getJson('/api/session')->assertJsonPath('vision.driver', 'openai')->assertJsonPath('vision.live', false);
    }

    public function test_unknown_driver_is_not_configured(): void
    {
        config(['lab.vision.driver' => 'banana']);
        $id = $this->projectWithScreenshot();

        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);
    }

    public function test_session_reports_live_vision_only_for_a_configured_real_driver(): void
    {
        $this->getJson('/api/session')->assertJsonPath('vision.live', false);

        $this->useOpenAi();
        $this->getJson('/api/session')->assertJsonPath('vision.driver', 'openai')->assertJsonPath('vision.live', true);
        $this->assertInstanceOf(VisionRecogniser::class, app(VisionRecogniser::class));
    }

    // ---- AI Brain (text only, always faked) ---------------------------------------

    public function test_aibrain_client_posts_the_multipart_contract_and_reads_response(): void
    {
        $this->useBrain();
        Http::fake(['brain.test/*' => Http::response(['response' => '  Hello there.  '])]);

        $text = app(AiBrainClient::class)->generate('SYS', 'USER', 'CTX', 0.5);

        $this->assertSame('Hello there.', $text);

        Http::assertSent(function (HttpRequest $request) {
            $fields = collect($request->data())->pluck('contents', 'name');

            return $request->url() === 'https://brain.test/api/generate'
                && $request->method() === 'POST'
                && $request->isMultipart()
                && $fields['token'] === 'brain-token'
                && $fields['system'] === 'SYS'
                && $fields['user'] === 'USER'
                && $fields['assistant'] === 'CTX'
                && $fields['temperature'] === '0.5';
        });
    }

    public function test_aibrain_error_bodies_become_ai_unavailable(): void
    {
        $this->useBrain();
        Http::fake(['*' => Http::response(['error' => 'Unauthorized IP'], 401)]);

        try {
            app(AiBrainClient::class)->generate('s', 'u');
            $this->fail('expected a LabException');
        } catch (LabException $e) {
            $this->assertSame('ai_unavailable', $e->errorCode);
            $this->assertSame(502, $e->status);
            $this->assertStringNotContainsString('Unauthorized IP', $e->getMessage());
        }
    }

    public function test_explain_returns_text_and_counts_against_quota(): void
    {
        $this->useBrain();
        Http::fake(['*' => Http::response(['response' => 'The robot drives forward 20 cm.'])]);

        $this->postJson('/api/ai/explain', ['blockText' => 'move forward for 20 cm', 'programText' => 'when program starts'])
            ->assertOk()
            ->assertExactJson(['text' => 'The robot drives forward 20 cm.']);

        $this->getJson('/api/usage')->assertJsonPath('usage.ai.used', 1);
        $this->getJson('/api/session')->assertJsonPath('assistant.available', true);

        Http::assertSent(fn (HttpRequest $r) => str_contains(collect($r->data())->pluck('contents', 'name')['user'], 'move forward for 20 cm'));
    }

    public function test_explain_validates_input_and_needs_aibrain(): void
    {
        Http::fake();

        $this->postJson('/api/ai/explain', ['blockText' => 'x'])->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);

        $this->useBrain();
        $this->postJson('/api/ai/explain', ['blockText' => str_repeat('x', 301)])->assertStatus(422)->assertJson(['code' => 'validation']);
        $this->postJson('/api/ai/explain', [])->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_scene_returns_the_parsed_proposal_and_rejects_non_json(): void
    {
        $this->useBrain();
        $proposal = ['objects' => [['type' => 'seed_pod_large', 'xCm' => 0, 'yCm' => 40]], 'goal' => ['type' => 'object_in_zone', 'objectType' => 'seed_pod_large'], 'assumptions' => ['The pod is 40 cm ahead.']];
        Http::fakeSequence()
            ->push(['response' => "```json\n".json_encode($proposal)."\n```"])
            ->push(['response' => 'Sure! Put a pod somewhere.']);

        $this->postJson('/api/ai/scene', ['description' => 'Push the big seed pod into the circle'])
            ->assertOk()
            ->assertExactJson(['raw' => $proposal]);

        $this->postJson('/api/ai/scene', ['description' => 'again'])->assertStatus(502)->assertJson(['code' => 'ai_bad_response']);
        $this->postJson('/api/ai/scene', ['description' => str_repeat('x', 501)])->assertStatus(422);
    }

    public function test_ai_quota_covers_assistant_calls_too(): void
    {
        config(['lab.limits.ai_requests_per_hour' => 1]);
        $this->useBrain();
        Http::fake(['*' => Http::response(['response' => 'ok'])]);

        $this->postJson('/api/ai/explain', ['blockText' => 'a'])->assertOk();
        $this->postJson('/api/ai/explain', ['blockText' => 'a'])->assertStatus(429)->assertJson(['code' => 'quota']);
        Http::assertSentCount(1);
    }

    public function test_the_vision_prompt_states_the_rules_the_simulator_depends_on(): void
    {
        $prompt = file_get_contents(resource_path('lab/vision-prompt.txt'));

        foreach (['NEVER GUESS', '"uncertain"', '"hat": null', 'unsupported', 'motor_run_for', 'elseChildren', '"screenshot"', '"notes"'] as $needle) {
            $this->assertStringContainsString($needle, $prompt);
        }
    }
}
