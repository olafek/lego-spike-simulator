<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->string('id', 32)->primary(); // random hex, unguessable
            $table->string('name', 120);
            $table->longText('data')->nullable(); // frontend-owned JSON blob
            $table->timestamp('last_opened_at')->nullable();
            $table->timestamps();
            $table->index('updated_at');
        });

        Schema::create('screenshots', function (Blueprint $table) {
            $table->string('id', 24)->primary();
            $table->string('project_id', 32);
            $table->unsignedInteger('position')->default(0);
            $table->string('path'); // on the private "local" disk
            $table->string('mime', 40);
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->unsignedInteger('bytes');
            $table->string('original_name', 120)->nullable();
            $table->timestamps();
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->index(['project_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('screenshots');
        Schema::dropIfExists('projects');
    }
};
