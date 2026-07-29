<?php

namespace Database\Factories;

use App\Models\WatchlistMod;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WatchlistMod>
 */
class WatchlistModFactory extends Factory
{
    protected $model = WatchlistMod::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'workshop_id' => (string) fake()->unique()->numberBetween(1000000000, 3999999999),
        ];
    }
}
