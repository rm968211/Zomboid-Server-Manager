<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('mod_workshop_links', function (Blueprint $table) {
            $table->id();
            $table->string('mod_id');
            $table->string('workshop_id', 20);
            $table->timestamps();

            $table->unique(['mod_id', 'workshop_id']);
            $table->index('workshop_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mod_workshop_links');
    }
};
