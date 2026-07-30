<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A mod ID lives in exactly one `mods/<Name>/` folder inside one Workshop
     * item, so a mod can never span uploads and this table modelled a
     * relationship that does not exist. The real one-to-many runs the other
     * way: one Workshop item declaring several mod IDs, which `Mods=` already
     * expresses on its own.
     */
    public function up(): void
    {
        Schema::dropIfExists('mod_workshop_links');
    }

    public function down(): void
    {
        Schema::create('mod_workshop_links', function ($table) {
            $table->id();
            $table->string('mod_id');
            $table->string('workshop_id', 20);
            $table->timestamps();

            $table->unique(['mod_id', 'workshop_id']);
            $table->index('workshop_id');
        });
    }
};
