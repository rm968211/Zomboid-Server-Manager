<?php

namespace Database\Factories;

use App\Models\WishlistMod;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WishlistMod>
 */
class WishlistModFactory extends Factory
{
    protected $model = WishlistMod::class;

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
