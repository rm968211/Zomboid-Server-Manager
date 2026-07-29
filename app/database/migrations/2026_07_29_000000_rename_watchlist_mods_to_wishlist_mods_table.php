<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::rename('watchlist_mods', 'wishlist_mods');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::rename('wishlist_mods', 'watchlist_mods');
    }
};
