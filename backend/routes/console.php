<?php

use App\Models\Project;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('lab:prune', function () {
    $cutoff = now()->subDays((int) config('lab.retention_days'));
    $count = 0;

    Project::with('screenshots')->where('updated_at', '<', $cutoff)->chunkById(50, function ($projects) use (&$count) {
        foreach ($projects as $project) {
            $project->screenshots->each->delete(); // removes the files
            $project->delete();
            $count++;
        }
    });

    $this->info("Pruned {$count} project(s) not updated since {$cutoff->toDateString()}.");
})->purpose('Delete projects and screenshots older than LAB_RETENTION_DAYS');

Schedule::command('lab:prune')->daily();
