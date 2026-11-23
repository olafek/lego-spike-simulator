<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Screenshot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Tables: a project made once (mat + picture + things on it) and copied onto programs.
 */
class TableTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->signIn();
    }

    private function make(array $body = [], string $prefix = ''): array
    {
        return $this->postJson("{$prefix}/api/projects", $body)->assertCreated()->json();
    }

    private function uploadMat(string $projectId, string $prefix = '')
    {
        return $this->post("{$prefix}/api/projects/{$projectId}/mat-image", ['image' => $this->pngUpload(236, 114, 'table.png')], ['Accept' => 'application/json']);
    }

    private function visitor(string $owner): static
    {
        $this->flushSession();

        return $this->withSession(['lab_demo_owner' => str_pad($owner, 32, '0')]);
    }

    public function test_a_table_is_created_listed_and_flagged(): void
    {
        $table = $this->make(['name' => 'Practice table', 'table' => true, 'data' => ['scene' => ['mat' => 'competition']]]);
        $program = $this->make(['name' => 'My program']);
        $this->uploadMat($table['id'])->assertCreated();

        $this->assertTrue($table['table']);
        $this->assertFalse($program['table']);

        $tables = $this->getJson('/api/projects?tables=1')->assertOk()->json();
        $this->assertCount(1, $tables);
        $this->assertSame('Practice table', $tables[0]['name']);
        $this->assertTrue($tables[0]['table']);
        $this->assertStringContainsString("/api/projects/{$table['id']}/screenshots/", $tables[0]['matImageUrl']);

        $all = collect($this->getJson('/api/projects')->json());
        $this->assertTrue($all->firstWhere('id', $table['id'])['table']);
        $this->assertFalse($all->firstWhere('id', $program['id'])['table']);
        $this->assertNull($all->firstWhere('id', $program['id'])['matImageUrl']);
    }

    public function test_tables_list_is_not_cut_off_at_fifty(): void
    {
        $table = $this->make(['name' => 'Old table', 'table' => true]);
        Project::whereKey($table['id'])->update(['updated_at' => now()->subDays(5)]);
        config(['lab.limits.projects_per_session_per_hour' => 1000]);
        for ($i = 0; $i < 51; $i++) {
            $this->make(['name' => "Program {$i}"]);
        }

        $this->assertNull(collect($this->getJson('/api/projects')->json())->firstWhere('id', $table['id']));
        $this->assertSame([$table['id']], array_column($this->getJson('/api/projects?tables=1')->json(), 'id'));
    }

    public function test_update_cannot_turn_a_project_into_a_table(): void
    {
        $program = $this->make();

        $this->putJson("/api/projects/{$program['id']}", ['name' => 'Sneaky', 'table' => true])->assertOk()->assertJson(['table' => false]);
        $this->assertSame([], $this->getJson('/api/projects?tables=1')->json());
    }

    public function test_use_table_copies_the_picture_and_returns_the_table_data(): void
    {
        $table = $this->make(['table' => true, 'data' => ['scene' => ['mat' => 'competition', 'objects' => [['id' => 'o1']]]]]);
        $mat = $this->uploadMat($table['id'])->json();
        $program = $this->make(['name' => 'My program', 'data' => ['summary' => 'mine']]);

        $used = $this->postJson("/api/projects/{$program['id']}/use-table", ['tableId' => $table['id']])->assertOk()->json();

        $this->assertSame($program['id'], $used['id']);
        $this->assertSame('mine', $used['data']['summary']); // the program's own data is untouched by the server
        $this->assertSame('competition', $used['tableData']['scene']['mat']);
        $this->assertSame('o1', $used['tableData']['scene']['objects'][0]['id']);
        $this->assertNotSame($mat['id'], $used['matImage']['id']);
        $this->get($used['matImage']['url'])->assertOk();
        // the table keeps its own picture
        $this->assertSame($mat['id'], $this->getJson("/api/projects/{$table['id']}")->json('matImage.id'));
    }

    public function test_use_table_replaces_an_existing_picture(): void
    {
        $table = $this->make(['table' => true]);
        $this->uploadMat($table['id']);
        $program = $this->make();
        $old = $this->uploadMat($program['id'])->json();
        $oldPath = Screenshot::findOrFail($old['id'])->path;

        $used = $this->postJson("/api/projects/{$program['id']}/use-table", ['tableId' => $table['id']])->assertOk()->json();

        $this->assertNotSame($old['id'], $used['matImage']['id']);
        Storage::disk('local')->assertMissing($oldPath);
        $this->assertSame(1, Screenshot::where('project_id', $program['id'])->where('kind', 'mat')->count());
    }

    public function test_use_table_with_a_table_without_picture_removes_the_picture(): void
    {
        $table = $this->make(['table' => true]);
        $program = $this->make();
        $this->uploadMat($program['id']);

        $this->postJson("/api/projects/{$program['id']}/use-table", ['tableId' => $table['id']])->assertOk()->assertJson(['matImage' => null]);
    }

    public function test_use_table_refuses_a_deleted_table_a_non_table_and_itself(): void
    {
        $table = $this->make(['table' => true]);
        $program = $this->make();
        $other = $this->make();

        $this->postJson("/api/projects/{$program['id']}/use-table", ['tableId' => $other['id']])->assertStatus(422)->assertJson(['code' => 'not_a_table']);
        $this->postJson("/api/projects/{$table['id']}/use-table", ['tableId' => $table['id']])->assertStatus(422)->assertJson(['code' => 'validation']);
        $this->postJson("/api/projects/{$program['id']}/use-table", [])->assertStatus(422)->assertJson(['code' => 'validation']);

        $this->deleteJson("/api/projects/{$table['id']}")->assertOk();
        $this->postJson("/api/projects/{$program['id']}/use-table", ['tableId' => $table['id']])->assertStatus(404)->assertJson(['code' => 'not_found']);
        $this->postJson('/api/projects/'.str_repeat('0', 32).'/use-table', ['tableId' => $table['id']])->assertStatus(404);
    }

    public function test_demo_visitor_cannot_use_a_lab_table_or_another_visitors_table(): void
    {
        config(['lab.demo.enabled' => true]);
        $labTable = $this->make(['table' => true]);

        $a = $this->visitor('a');
        $aTable = $a->postJson('/demo/api/projects', ['table' => true])->assertCreated()->json();
        $aProgram = $a->postJson('/demo/api/projects')->assertCreated()->json();
        $a->postJson("/demo/api/projects/{$aProgram['id']}/use-table", ['tableId' => $aTable['id']])->assertOk();
        $a->postJson("/demo/api/projects/{$aProgram['id']}/use-table", ['tableId' => $labTable['id']])->assertStatus(404);
        $this->assertSame([$aTable['id']], array_column($a->getJson('/demo/api/projects?tables=1')->json(), 'id'));

        $b = $this->visitor('b');
        $bProgram = $b->postJson('/demo/api/projects')->assertCreated()->json();
        $b->postJson("/demo/api/projects/{$bProgram['id']}/use-table", ['tableId' => $aTable['id']])->assertStatus(404);
        $this->assertSame([], $b->getJson('/demo/api/projects?tables=1')->json());
    }

    public function test_prune_keeps_old_lab_tables_and_removes_old_demo_tables(): void
    {
        config(['lab.demo.enabled' => true, 'lab.retention_days' => 30, 'lab.demo.retention_hours' => 24]);
        $labTable = $this->make(['table' => true]);
        $this->uploadMat($labTable['id']);
        $labProgram = $this->make();
        $demoTable = $this->visitor('a')->postJson('/demo/api/projects', ['table' => true])->assertCreated()->json();

        $this->travel(40)->days();
        $this->artisan('lab:prune')->assertSuccessful();

        $ids = Project::withoutGlobalScopes()->pluck('id')->all();
        $this->assertSame([$labTable['id']], $ids);
        $this->assertNotContains($labProgram['id'], $ids);
        $this->assertNotContains($demoTable['id'], $ids);
        $this->assertSame(1, Screenshot::where('kind', 'mat')->count());
    }
}
