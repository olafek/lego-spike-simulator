<?php

namespace Tests\Feature;

use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class EnforcingCsrf extends PreventRequestForgery
{
    protected function runningUnitTests()
    {
        return false; // Laravel skips CSRF in tests; this test wants the real check.
    }
}

class AccessTest extends TestCase
{
    use RefreshDatabase;

    public static function protectedRoutes(): array
    {
        return [
            ['GET', '/api/usage'],
            ['GET', '/api/projects'],
            ['POST', '/api/projects'],
            ['POST', '/api/projects/import'],
            ['GET', '/api/projects/abc'],
            ['PUT', '/api/projects/abc'],
            ['DELETE', '/api/projects/abc'],
            ['POST', '/api/projects/abc/duplicate'],
            ['GET', '/api/projects/abc/export'],
            ['POST', '/api/projects/abc/screenshots'],
            ['PUT', '/api/projects/abc/screenshots/order'],
            ['DELETE', '/api/projects/abc/screenshots/def'],
            ['GET', '/api/projects/abc/screenshots/def/image'],
            ['POST', '/api/projects/abc/recognise'],
            ['POST', '/api/ai/explain'],
            ['POST', '/api/ai/scene'],
        ];
    }

    #[DataProvider('protectedRoutes')]
    public function test_every_api_route_rejects_visitors_without_the_password(string $method, string $uri): void
    {
        $this->json($method, $uri)
            ->assertStatus(401)
            ->assertJson(['code' => 'unauthenticated']);
    }

    public function test_the_route_list_has_no_unprotected_api_route_besides_the_gate(): void
    {
        $open = [];

        foreach (app('router')->getRoutes() as $route) {
            if (str_starts_with($route->uri(), 'api/') && ! in_array('lab.auth', $route->gatherMiddleware(), true)) {
                $open[] = $route->uri();
            }
        }

        sort($open);
        $this->assertSame(['api/login', 'api/logout', 'api/session', 'api/{any}'], $open);
    }

    public function test_session_endpoint_is_public_and_reports_state(): void
    {
        $this->getJson('/api/session')
            ->assertOk()
            ->assertJson(['authenticated' => false, 'vision' => ['driver' => 'mock', 'live' => false], 'assistant' => ['available' => false]])
            ->assertJsonStructure(['limits' => ['maxUploadMb', 'maxScreenshotsPerProject', 'maxImageDimension', 'maxAiRequestsPerHour', 'aiRemaining']])
            ->assertCookie('XSRF-TOKEN');

        $this->signIn()->getJson('/api/session')->assertJson(['authenticated' => true]);
    }

    public function test_right_password_opens_the_lab_and_logout_closes_it(): void
    {
        $this->postJson('/api/login', ['password' => self::PASSWORD])
            ->assertOk()
            ->assertJson(['authenticated' => true]);

        $this->getJson('/api/projects')->assertOk();

        $this->postJson('/api/logout')->assertOk();
        $this->getJson('/api/projects')->assertStatus(401);
    }

    public function test_login_regenerates_the_session_id(): void
    {
        $this->getJson('/api/session');
        $before = session()->getId();

        $this->postJson('/api/login', ['password' => self::PASSWORD])->assertOk();

        $this->assertNotSame($before, session()->getId());
    }

    public function test_wrong_password_is_rejected_and_never_echoed(): void
    {
        $response = $this->postJson('/api/login', ['password' => 'nope'])
            ->assertStatus(422)
            ->assertJson(['code' => 'wrong_password', 'attemptsLeft' => 4]);

        $this->assertStringNotContainsString(self::PASSWORD, $response->getContent());
        $this->getJson('/api/projects')->assertStatus(401);
    }

    public function test_non_string_and_prefix_passwords_are_rejected(): void
    {
        $this->postJson('/api/login', ['password' => ['a' => 'b']])->assertStatus(422);
        $this->postJson('/api/login', ['password' => substr(self::PASSWORD, 0, -1)])->assertStatus(422);
        $this->postJson('/api/login', [])->assertStatus(422);
    }

    public function test_repeated_bad_passwords_trigger_a_cooldown_that_blocks_even_the_right_one(): void
    {
        config(['lab.login.max_attempts' => 3, 'lab.login.cooldown_seconds' => 60]);

        $this->postJson('/api/login', ['password' => 'a'])->assertStatus(422)->assertJson(['attemptsLeft' => 2]);
        $this->postJson('/api/login', ['password' => 'b'])->assertStatus(422)->assertJson(['attemptsLeft' => 1]);
        $this->postJson('/api/login', ['password' => 'c'])->assertStatus(429)->assertJson(['code' => 'cooldown']);

        $locked = $this->postJson('/api/login', ['password' => self::PASSWORD])
            ->assertStatus(429)
            ->assertJson(['code' => 'cooldown']);
        $this->assertGreaterThan(0, $locked->json('retryAfter'));

        $this->travel(61)->seconds();
        $this->postJson('/api/login', ['password' => self::PASSWORD])->assertOk();
    }

    public function test_login_is_refused_when_no_password_is_configured(): void
    {
        config(['lab.password' => '']);

        $this->postJson('/api/login', ['password' => ''])->assertStatus(503)->assertJson(['code' => 'not_configured']);
        $this->getJson('/api/projects')->assertStatus(401);
    }

    public function test_session_expires_after_the_configured_hours(): void
    {
        config(['lab.session_hours' => 2]);
        $this->postJson('/api/login', ['password' => self::PASSWORD])->assertOk();

        $this->travel(119)->minutes();
        $this->getJson('/api/projects')->assertOk();

        $this->travel(2)->minutes();
        $this->getJson('/api/projects')->assertStatus(401);
    }

    public function test_csrf_token_is_required_for_state_changing_requests(): void
    {
        $this->app->bind(PreventRequestForgery::class, EnforcingCsrf::class);

        $this->postJson('/api/login', ['password' => self::PASSWORD])
            ->assertStatus(419)
            ->assertJson(['code' => 'csrf']);

        $this->getJson('/api/session');
        $this->postJson('/api/login', ['password' => self::PASSWORD], ['X-CSRF-TOKEN' => session()->token()])
            ->assertOk();
    }

    public function test_pages_redirect_to_the_gate_until_signed_in(): void
    {
        $this->get('/')->assertRedirect('/login');
        $this->get('/simulator/whatever')->assertRedirect('/login');
        $this->get('/login')->assertOk();
        $this->signIn()->get('/simulator/whatever')->assertOk();
    }

    public function test_unknown_api_paths_return_json_404(): void
    {
        $this->signIn()->getJson('/api/nope')->assertStatus(404)->assertJson(['code' => 'not_found']);
        $this->signIn()->getJson('/api/projects/'.str_repeat('0', 32))->assertStatus(404)->assertJson(['code' => 'not_found']);
    }

    public function test_session_cookie_is_http_only_and_same_site(): void
    {
        $this->assertTrue(config('session.http_only'));
        $this->assertSame('lax', config('session.same_site'));
        $this->assertSame(config('lab.session_hours') * 60, config('session.lifetime'));
    }
}
