<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // null = a real lab project; otherwise the random id of the demo visitor who made it
            $table->string('demo_owner', 32)->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['demo_owner']);
            $table->dropColumn('demo_owner');
        });
    }
};
