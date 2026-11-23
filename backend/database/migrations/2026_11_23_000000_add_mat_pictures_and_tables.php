<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('screenshots', function (Blueprint $table) {
            // 'program' = a screenshot of a SPIKE program; 'mat' = the straightened photo of a table (one per project)
            $table->string('kind', 10)->default('program');
            $table->index(['project_id', 'kind']);
        });

        Schema::table('projects', function (Blueprint $table) {
            // a saved table: made once, copied onto programs, and kept by the cleanup
            $table->boolean('is_table')->default(false)->index();
        });
    }

    public function down(): void
    {
        Schema::table('screenshots', function (Blueprint $table) {
            $table->dropIndex(['project_id', 'kind']);
            $table->dropColumn('kind');
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['is_table']);
            $table->dropColumn('is_table');
        });
    }
};
