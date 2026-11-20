<?php

use App\Models\Project;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('lab:prune', function () {
    $cutoff = now()->subDays((int) config('lab.retention_days'));
    $count = 0;

    $demoCutoff = now()->subHours((int) config('lab.demo.retention_hours'));

    // lab projects after LAB_RETENTION_DAYS, demo projects after LAB_DEMO_RETENTION_HOURS
    $old = Project::withoutGlobalScopes()->with('screenshots')->where(function ($q) use ($cutoff, $demoCutoff) {
        $q->where(fn ($lab) => $lab->whereNull('demo_owner')->where('updated_at', '<', $cutoff))
            ->orWhere(fn ($demo) => $demo->whereNotNull('demo_owner')->where('updated_at', '<', $demoCutoff));
    });

    $old->chunkById(50, function ($projects) use (&$count) {
        foreach ($projects as $project) {
            $project->screenshots->each->delete(); // removes the files
            $project->delete();
            $count++;
        }
    });

    $this->info("Pruned {$count} project(s) not updated since {$cutoff->toDateString()}.");
})->purpose('Delete projects and screenshots older than LAB_RETENTION_DAYS');

Schedule::command('lab:prune')->hourly();
