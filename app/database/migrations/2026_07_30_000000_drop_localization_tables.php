<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('translations');
        Schema::dropIfExists('languages');

        if (Schema::hasColumn('site_settings', 'default_locale')) {
            Schema::table('site_settings', function (Blueprint $table) {
                $table->dropColumn('default_locale');
            });
        }
    }

    public function down(): void
    {
        // The app is English-only; the translation tables are not restored.
    }
};
