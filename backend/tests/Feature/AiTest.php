<?php

namespace Tests\Feature;

use App\Services\Ai\AiProvider;
use App\Services\Ai\GeminiProvider;
use App\Services\Ai\OpenAiProvider;
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
        config(['lab.ai.provider' => 'openai', 'lab.ai.openai.key' => 'sk-test-key', 'lab.ai.openai.model' => 'vision-model-x']);
    }

    private function openAiAnswer(string $content): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => $content], 'finish_reason' => 'stop']]];
    }

    private function useGemini(): void
    {
        config(['lab.ai.provider' => 'gemini', 'lab.ai.gemini.key' => 'g-test-key', 'lab.ai.gemini.model' => 'gem-model-x']);
    }

    private function geminiAnswer(string ...$parts): array
    {
        return ['candidates' => [['content' => ['role' => 'model', 'parts' => array_map(fn ($t) => ['text' => $t], $parts)], 'finishReason' => 'STOP']]];
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
        config(['lab.ai.provider' => 'openai', 'lab.ai.openai.key' => '', 'lab.ai.openai.model' => 'm']);
        Http::fake();
        $id = $this->projectWithScreenshot();

        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);

        config(['lab.ai.openai.key' => 'k', 'lab.ai.openai.model' => '']);
        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);

        Http::assertNothingSent();
        $this->getJson('/api/usage')->assertJsonPath('usage.ai.used', 0);
        $this->getJson('/api/session')->assertJsonPath('vision.driver', 'openai')->assertJsonPath('vision.live', false);
    }

    public function test_unknown_driver_is_not_configured(): void
    {
        config(['lab.ai.provider' => 'banana']);
        $id = $this->projectWithScreenshot();

        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);
    }

    public function test_session_reports_live_vision_only_for_a_configured_real_driver(): void
    {
        $this->getJson('/api/session')->assertJsonPath('vision.live', false);

        $this->useOpenAi();
        $this->getJson('/api/session')->assertJsonPath('vision.driver', 'openai')->assertJsonPath('vision.live', true);
        $this->assertInstanceOf(OpenAiProvider::class, app(AiProvider::class));

        $this->useGemini();
        $this->getJson('/api/session')->assertJsonPath('vision.driver', 'gemini')->assertJsonPath('vision.live', true);
        $this->assertInstanceOf(GeminiProvider::class, app(AiProvider::class));
    }

    // ---- recognition: Gemini driver (always faked) --------------------------------

    public function test_gemini_driver_sends_prompt_and_images_and_parses_the_json(): void
    {
        $this->useGemini();
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($this->geminiAnswer('{"stacks":[{"hat":null,', '"blocks":[]}],"notes":["ok"]}'))]);

        $id = $this->postJson('/api/projects')->json('id');
        $this->post("/api/projects/{$id}/screenshots", ['image' => $this->pngUpload(40, 40)])->assertCreated();
        $this->post("/api/projects/{$id}/screenshots", ['image' => $this->pngUpload(60, 60)])->assertCreated();

        $this->postJson("/api/projects/{$id}/recognise")
            ->assertOk()
            ->assertJsonPath('driver', 'gemini')
            ->assertJsonPath('model', 'gem-model-x')
            ->assertJsonPath('raw.notes.0', 'ok') // the answer arrived in two parts and was joined
            ->assertJsonCount(2, 'screenshotIds');

        Http::assertSent(function (HttpRequest $request) {
            $body = $request->data();
            $parts = $body['contents'][0]['parts'];
            $images = array_values(array_filter($parts, fn ($p) => isset($p['inline_data'])));

            return $request->url() === 'https://generativelanguage.googleapis.com/v1beta/models/gem-model-x:generateContent'
                && $request->hasHeader('x-goog-api-key', 'g-test-key')
                && ! str_contains($request->url(), 'g-test-key') // the key is never put in the URL
                && str_contains($body['system_instruction']['parts'][0]['text'], 'NEVER GUESS')
                && $body['generationConfig']['responseMimeType'] === 'application/json'
                && count($images) === 2
                && $images[0]['inline_data']['mime_type'] === 'image/png'
                && getimagesizefromstring(base64_decode($images[0]['inline_data']['data']))[0] === 40;
        });
    }

    public function test_gemini_errors_blocked_answers_and_missing_settings(): void
    {
        $id = $this->projectWithScreenshot();

        $this->useGemini();
        Http::fakeSequence()
            ->push(['error' => ['message' => 'API key not valid: g-test-key']], 400)
            ->push(['promptFeedback' => ['blockReason' => 'SAFETY'], 'candidates' => []])
            ->push($this->geminiAnswer('The robot moves.'));

        $failed = $this->postJson("/api/projects/{$id}/recognise")->assertStatus(502)->assertJson(['code' => 'ai_unavailable']);
        $this->assertStringNotContainsString('g-test-key', $failed->getContent());
        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(502)->assertJson(['code' => 'ai_bad_response']);
        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(502)->assertJson(['code' => 'ai_bad_response']); // text, not JSON

        config(['lab.ai.gemini.key' => '']);
        $this->postJson("/api/projects/{$id}/recognise")->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);
        $this->getJson('/api/session')->assertJsonPath('vision.live', false)->assertJsonPath('assistant.available', false);
        Http::assertSentCount(3);
    }

    // ---- text helpers: explain a block, suggest a mat (always faked) ----------------

    public function test_explain_uses_the_same_provider_and_counts_against_quota(): void
    {
        $this->useOpenAi();
        Http::fake(['api.openai.com/*' => Http::response($this->openAiAnswer("  The robot drives forward 20 cm.\n"))]);

        $this->postJson('/api/ai/explain', ['blockText' => 'move forward for 20 cm', 'programText' => 'when program starts'])
            ->assertOk()
            ->assertExactJson(['text' => 'The robot drives forward 20 cm.']);

        $this->getJson('/api/usage')->assertJsonPath('usage.ai.used', 1);
        $this->getJson('/api/session')->assertJsonPath('assistant.available', true);

        Http::assertSent(function (HttpRequest $request) {
            $body = $request->data();

            return $request->url() === 'https://api.openai.com/v1/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer sk-test-key')
                && $body['model'] === 'vision-model-x'
                && ! isset($body['response_format'])
                && ! isset($body['temperature']) // some models only accept their default
                && $body['messages'][0]['role'] === 'system'
                && str_contains($body['messages'][0]['content'], '10-year-old')
                && str_contains($body['messages'][1]['content'], 'move forward for 20 cm')
                && str_contains($body['messages'][1]['content'], 'when program starts');
        });
    }

    public function test_explain_works_with_gemini_too(): void
    {
        $this->useGemini();
        Http::fake(['*' => Http::response($this->geminiAnswer('It turns the wheels.'))]);

        $this->postJson('/api/ai/explain', ['blockText' => 'motor C run for 90 degrees'])->assertOk()->assertExactJson(['text' => 'It turns the wheels.']);

        Http::assertSent(fn (HttpRequest $r) => str_contains($r->data()['contents'][0]['parts'][0]['text'], 'motor C run for 90 degrees') && ! isset($r->data()['generationConfig']));
    }

    public function test_a_custom_openai_compatible_base_url_is_used(): void
    {
        $this->useOpenAi();
        config(['lab.ai.openai.base_url' => 'http://models.test:11434/v1']);
        Http::fake(['models.test:11434/*' => Http::response($this->openAiAnswer('ok'))]);

        $this->postJson('/api/ai/explain', ['blockText' => 'wait 1 seconds'])->assertOk();

        Http::assertSent(fn (HttpRequest $r) => $r->url() === 'http://models.test:11434/v1/chat/completions');
    }

    public function test_text_helpers_are_off_in_mock_mode_and_validate_input(): void
    {
        Http::fake();

        // mock provider: no text model, nothing is sent, no quota is spent
        $this->getJson('/api/session')->assertJsonPath('assistant.available', false);
        $this->postJson('/api/ai/explain', ['blockText' => 'x'])->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);
        $this->postJson('/api/ai/scene', ['description' => 'x'])->assertStatus(503)->assertJson(['code' => 'ai_not_configured']);
        $this->getJson('/api/usage')->assertJsonPath('usage.ai.used', 0);

        $this->useOpenAi();
        $this->postJson('/api/ai/explain', ['blockText' => str_repeat('x', 301)])->assertStatus(422)->assertJson(['code' => 'validation']);
        $this->postJson('/api/ai/explain', [])->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_provider_errors_in_text_helpers_do_not_leak_details(): void
    {
        $this->useOpenAi();
        Http::fake(['*' => Http::response(['error' => ['message' => 'Incorrect API key provided: sk-test-key']], 401)]);

        $response = $this->postJson('/api/ai/explain', ['blockText' => 'a'])->assertStatus(502)->assertJson(['code' => 'ai_unavailable']);

        $this->assertStringNotContainsString('sk-test-key', $response->getContent());
    }

    public function test_scene_returns_the_parsed_proposal_and_rejects_non_json(): void
    {
        $this->useOpenAi();
        $proposal = ['objects' => [['type' => 'seed_pod_large', 'xCm' => 0, 'yCm' => 40]], 'goal' => ['type' => 'object_in_zone', 'objectType' => 'seed_pod_large'], 'assumptions' => ['The pod is 40 cm ahead.']];
        Http::fakeSequence()
            ->push($this->openAiAnswer("```json\n".json_encode($proposal)."\n```"))
            ->push($this->openAiAnswer('Sure! Put a pod somewhere.'));

        $this->postJson('/api/ai/scene', ['description' => 'Push the big seed pod into the circle'])
            ->assertOk()
            ->assertExactJson(['raw' => $proposal]);

        $this->postJson('/api/ai/scene', ['description' => 'again'])->assertStatus(502)->assertJson(['code' => 'ai_bad_response']);
        $this->postJson('/api/ai/scene', ['description' => str_repeat('x', 501)])->assertStatus(422);
    }

    public function test_ai_quota_covers_text_helper_calls_too(): void
    {
        config(['lab.limits.ai_requests_per_hour' => 1]);
        $this->useOpenAi();
        Http::fake(['*' => Http::response($this->openAiAnswer('ok'))]);

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
